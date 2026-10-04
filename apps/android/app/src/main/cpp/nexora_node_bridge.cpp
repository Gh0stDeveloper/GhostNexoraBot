#include <jni.h>
#include <atomic>
#include <string>
#include <vector>

#if NEXORA_EMBEDDED_NODE
#include <node.h>
#endif

namespace {
std::atomic_bool g_stop_requested{false};

std::vector<std::string> to_strings(JNIEnv* env, jobjectArray values) {
    const jsize size = env->GetArrayLength(values);
    std::vector<std::string> output;
    output.reserve(static_cast<size_t>(size));
    for (jsize index = 0; index < size; ++index) {
        auto* value = static_cast<jstring>(env->GetObjectArrayElement(values, index));
        const char* utf = env->GetStringUTFChars(value, nullptr);
        output.emplace_back(utf != nullptr ? utf : "");
        if (utf != nullptr) env->ReleaseStringUTFChars(value, utf);
        env->DeleteLocalRef(value);
    }
    return output;
}
}

extern "C" JNIEXPORT jint JNICALL
Java_com_ghostnexora_manager_EmbeddedNodeHost_nativeStart(
    JNIEnv* env,
    jobject,
    jobjectArray argv
) {
#if NEXORA_EMBEDDED_NODE
    g_stop_requested.store(false);
    auto owned = to_strings(env, argv);
    std::vector<char*> raw;
    raw.reserve(owned.size());
    for (auto& item : owned) raw.push_back(item.data());
    return node::Start(static_cast<int>(raw.size()), raw.data());
#else
    (void)env;
    (void)argv;
    return -78;
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_ghostnexora_manager_EmbeddedNodeHost_nativeRequestStop(
    JNIEnv*,
    jobject
) {
    // The service already owns the crash/restart policy. The Node embedder will
    // consume this flag through its native lifecycle hook once libnode is linked.
    g_stop_requested.store(true);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_ghostnexora_manager_EmbeddedNodeHost_nativeVersion(
    JNIEnv* env,
    jobject
) {
#if NEXORA_EMBEDDED_NODE
    return env->NewStringUTF(NODE_VERSION);
#else
    return env->NewStringUTF("unavailable");
#endif
}
