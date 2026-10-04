cmake_minimum_required(VERSION 3.22.1)
project(nexora_node_bridge LANGUAGES CXX)

add_library(nexora_node_bridge SHARED nexora_node_bridge.cpp)
target_compile_features(nexora_node_bridge PRIVATE cxx_std_20)
target_compile_options(nexora_node_bridge PRIVATE -Wall -Wextra -Werror)

set(NEXORA_NODE_ROOT "" CACHE PATH "Directory containing Node Android headers and libnode.so")
if (NEXORA_NODE_ROOT AND EXISTS "${NEXORA_NODE_ROOT}/lib/libnode.so")
    add_library(nexora_embedded_node SHARED IMPORTED)
    set_target_properties(nexora_embedded_node PROPERTIES
        IMPORTED_LOCATION "${NEXORA_NODE_ROOT}/lib/libnode.so"
    )
    target_include_directories(nexora_node_bridge PRIVATE "${NEXORA_NODE_ROOT}/include")
    target_compile_definitions(nexora_node_bridge PRIVATE NEXORA_EMBEDDED_NODE=1)
    target_link_libraries(nexora_node_bridge PRIVATE nexora_embedded_node log android)
else()
    target_compile_definitions(nexora_node_bridge PRIVATE NEXORA_EMBEDDED_NODE=0)
    target_link_libraries(nexora_node_bridge PRIVATE log android)
endif()
