cmake_minimum_required(VERSION 3.22.1)
project(nexora_node_bridge LANGUAGES CXX)

add_library(nexora_node_bridge SHARED nexora_node_bridge.cpp)
target_compile_features(nexora_node_bridge PRIVATE cxx_std_20)
target_compile_options(nexora_node_bridge PRIVATE -Wall -Wextra -Werror)

set(NEXORA_NODE_ROOT "" CACHE PATH "Root containing per-ABI Node Android artifacts")

if (NEXORA_NODE_ROOT)
    set(NEXORA_NODE_ABI_ROOT "${NEXORA_NODE_ROOT}/${ANDROID_ABI}")
else()
    set(NEXORA_NODE_ABI_ROOT "")
endif()

if (
    NEXORA_NODE_ABI_ROOT
    AND EXISTS "${NEXORA_NODE_ABI_ROOT}/libnode.so"
    AND EXISTS "${NEXORA_NODE_ABI_ROOT}/include/node/node.h"
)
    add_library(nexora_embedded_node SHARED IMPORTED)
    set_target_properties(nexora_embedded_node PROPERTIES
        IMPORTED_LOCATION "${NEXORA_NODE_ABI_ROOT}/libnode.so"
    )

    target_include_directories(
        nexora_node_bridge
        PRIVATE
        "${NEXORA_NODE_ABI_ROOT}/include/node"
        "${NEXORA_NODE_ABI_ROOT}/include/v8"
        "${NEXORA_NODE_ABI_ROOT}/include/uv"
        "${NEXORA_NODE_ABI_ROOT}/include/openssl"
    )
    target_compile_definitions(nexora_node_bridge PRIVATE NEXORA_EMBEDDED_NODE=1)
    target_link_libraries(nexora_node_bridge PRIVATE nexora_embedded_node log android)
else()
    message(WARNING "Nexora Embedded Node not staged for ${ANDROID_ABI}; building unavailable-runtime bridge")
    target_compile_definitions(nexora_node_bridge PRIVATE NEXORA_EMBEDDED_NODE=0)
    target_link_libraries(nexora_node_bridge PRIVATE log android)
endif()
