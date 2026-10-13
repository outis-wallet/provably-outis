// Prover.prove for Java: os_wasm_probe's C entry point (prover/crates/os_wasm_probe/src/replay.rs,
// in the prover submodule, linked as a static library), with its progress events passed on to a
// Java listener.
#include <jni.h>
#include <stdint.h>

typedef void (*tx_progress_callback)(void *context, const char *event_json);
char *tx_prove_replay(const char *capture_dir, uint32_t threads, tx_progress_callback progress, void *context);
void tx_prove_replay_cancel(void);
void tx_prove_free(char *answer);
// The library's `gpu` feature (android/build-rust.sh builds it in).
char *tx_prove_set_gpu(uint32_t enabled);

static JavaVM *java_vm;

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    java_vm = vm;
    return JNI_VERSION_1_6;
}

struct listener {
    jobject object; // a global reference: the events come from other threads
    jmethodID on_event;
};

// Called on the prover's threads (rayon's and the memory sampler's), which Java does not know:
// each is attached for the call.
static void forward_event(void *context, const char *event_json) {
    struct listener *listener = context;
    JNIEnv *env;
    int attached = 0;
    if ((*java_vm)->GetEnv(java_vm, (void **)&env, JNI_VERSION_1_6) == JNI_EDETACHED) {
        if ((*java_vm)->AttachCurrentThread(java_vm, &env, NULL) != JNI_OK) return;
        attached = 1;
    }
    jstring event = (*env)->NewStringUTF(env, event_json);
    (*env)->CallVoidMethod(env, listener->object, listener->on_event, event);
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
    (*env)->DeleteLocalRef(env, event);
    if (attached) (*java_vm)->DetachCurrentThread(java_vm);
}

JNIEXPORT jstring JNICALL Java_dev_provablyoutis_showcase_Prover_prove(JNIEnv *env, jclass prover, jstring capture_dir,
                                                                  jint threads, jobject listener_object) {
    struct listener listener = {
        .object = (*env)->NewGlobalRef(env, listener_object),
        .on_event = (*env)->GetMethodID(env, (*env)->GetObjectClass(env, listener_object), "onEvent", "(Ljava/lang/String;)V"),
    };
    const char *path = (*env)->GetStringUTFChars(env, capture_dir, NULL);
    char *answer = tx_prove_replay(path, threads > 0 ? (uint32_t)threads : 0, forward_event, &listener);
    (*env)->ReleaseStringUTFChars(env, capture_dir, path);
    (*env)->DeleteGlobalRef(env, listener.object);
    jstring report = (*env)->NewStringUTF(env, answer ? answer : "{\"error\": \"The prover gave no answer.\"}");
    tx_prove_free(answer);
    return report;
}

JNIEXPORT void JNICALL Java_dev_provablyoutis_showcase_Prover_cancel(JNIEnv *env, jclass prover) {
    tx_prove_replay_cancel();
}

JNIEXPORT jstring JNICALL Java_dev_provablyoutis_showcase_Prover_setGpu(JNIEnv *env, jclass prover, jboolean enabled) {
    char *answer = tx_prove_set_gpu(enabled ? 1 : 0);
    jstring result = (*env)->NewStringUTF(env, answer ? answer : "{\"error\": \"The prover gave no answer.\"}");
    tx_prove_free(answer);
    return result;
}
