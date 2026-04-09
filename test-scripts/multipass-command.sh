#!/bin/sh

CONTEXT_NAME="context-name"

generate_multipass() {
    # echo "adsfasdfasdf"
    # echo "CONTEXT_NAME is $CONTEXT_NAME"
    # echo "$1"
    IMAGE="24.04"
  if [ "$1" = "launch" ]; then
    if [ -n "${IMAGE}" ]; then
      # --image 옵션이 있으면 제거하고 이미지를 첫 번째 인자로 추가
      ARGS=()
      SKIP_NEXT=false
      for arg in "${@:2}"; do
        echo "arg is $arg"
        if [ "${SKIP_NEXT}" = "true" ]; then
          SKIP_NEXT=false
          continue
        fi
        if [ "$arg" = "--image" ]; then
          SKIP_NEXT=true
          continue
        fi
        ARGS+=("$arg")
      done
      echo "1"
      command echo "${IMAGE}" "${ARGS[@]}"
      return $?
    fi
  fi
  echo "2"
  command echo "$@"
}

set_worker_size() {
  WORKER_SIZE=${1:-2}
#   echo "Worker size is $WORKER_SIZE"
}

generate_multipass $1

# echo "Worker size is $2"
set_worker_size $2



multipass() {
  if [ "$1" = "launch" ]; then
    if [ -n "${IMAGE}" ]; then
      # --image 옵션이 있으면 제거하고 이미지를 첫 번째 인자로 추가
      ARGS=()
      SKIP_NEXT=false
      for arg in "${@:2}"; do
        if [ "${SKIP_NEXT}" = "true" ]; then
          SKIP_NEXT=false
          continue
        fi
        if [ "$arg" = "--image" ]; then
          SKIP_NEXT=true
          continue
        fi
        ARGS+=("$arg")
      done
      command multipass launch "${IMAGE}" "${ARGS[@]}"
      return $?
    fi
  fi
  command multipass "$@"
}