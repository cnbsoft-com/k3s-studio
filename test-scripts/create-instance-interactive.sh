#!/bin/sh

#validate_param() {
#  for i in $@; do
#    echo $i
#  done
#}
#
#validate_paramvalidate_param() {
#  for i in $@; do
#    echo $i
#  done
#}
#
#validate_param
#read -s -p "cpu siz: " cpu_size
#echo "\nsize is : $cpu_size"

set cpu_size
set mem_size
set disk_size
set mount_path
set instance_name
set multipass_image
set confirm

create_instance() {
  NETWORK_NAME=$(multipass networks | grep en0 | awk '{print $1}')
  if [ -n "${multipass_image}" ]; then
    multipass launch ${multipass_image} --name ${instance_name} --cpus $cpu_size --memory ${mem_size}G --disk ${disk_size}GB --network ${NETWORK_NAME} ${mount_path}
  else
    multipass launch --name ${instance_name} --cpus $cpu_size --memory ${mem_size}G --disk ${disk_size}GB --network ${NETWORK_NAME} ${mount_path}
  fi
}

find_multipass_image () {
  multipass find | awk 'NR>1 && $1 ~ /^[0-9]{2}\.[0-9]{2}$/ {print$1}' | sort -u
}

select_multipass_image() {
  # 우선순위: MULTIPASS_IMAGE 환경변수 > 인터랙티브 선택 > 기본값
  DEFAULT_IMAGE="25.04"
  
  if [ -n "${MULTIPASS_IMAGE}" ]; then
    multipass_image="${MULTIPASS_IMAGE}"
    echo "Multipass image preset by MULTIPASS_IMAGE: ${multipass_image}"
    return 0
  fi

  # 이미지 목록 검색
  echo ""
  echo "Multipass 이미지 목록을 검색합니다..."
  IMAGE_LIST="$(find_multipass_image | grep -v '^$')"

  if [ -z "${IMAGE_LIST}" ]; then
    echo "이미지 목록을 가져오지 못했습니다. 기본값(${DEFAULT_IMAGE})을 사용합니다."
    multipass_image="${DEFAULT_IMAGE}"
    return 0
  fi

  echo ""
  echo "사용할 이미지를 선택하세요:"
  echo "${IMAGE_LIST}" | nl -w2 -s'. '
  echo "  c. 직접 입력 (custom)"
  echo "  Enter. 기본값 사용 (${DEFAULT_IMAGE})"
  
  while :; do
    printf "번호를 입력하세요 (기본: ${DEFAULT_IMAGE}): "
    read ans
    case "${ans}" in
      "" )
        multipass_image="${DEFAULT_IMAGE}"
        break
        ;;
      c|C )
        printf "이미지 이름을 입력하세요 (예: ubuntu-24.04): "
        read custom
        if [ -n "${custom}" ]; then
          multipass_image="${custom}"
          break
        fi
        echo "유효하지 않은 입력입니다."
        ;;
      * )
        # 숫자 선택 처리
        if echo "${ans}" | grep -Eq '^[0-9]+$'; then
          choice="$(echo "${IMAGE_LIST}" | sed -n "${ans}p")"
          if [ -n "${choice}" ]; then
            multipass_image="${choice}"
            break
          fi
        fi
        echo "유효하지 않은 입력입니다. 다시 시도하세요."
        ;;
    esac
  done

  echo "선택된 이미지: ${multipass_image}"
  return 0
}

init_multipass() {
  read -p "type cpu size[Default: 2]: " cpu_size
  read -p "type memory size(GB)[Default: 2GB]: " mem_size
  read -p "type disk size(GB)[Default: 10G]: " disk_size
  read -p "type mount path[Default null]: " mount_path
  read -p "type instance name: " instance_name

  cpu_size=${cpu_size:-2}
  mem_size=${mem_size:-2}
  disk_size=${disk_size:-10}

  # Multipass 이미지 선택
  select_multipass_image

  echo ""
  echo "##### typed infos #####"
  echo "cpu_size : ${cpu_size}"
  echo "mem_size : ${mem_size}"
  echo "disk_size : ${disk_size}"
  echo "instance_name : ${instance_name}"
  echo "mount_path : ${mount_path}"
  echo "multipass_image : ${multipass_image}"

  if [[ -z "$instance_name" ]]; then
      echo "Instance name is required" >&2
      exit 1
  fi

  for i in $(/usr/local/bin/multipass ls | grep -v "Name" | awk '{print$1}'); do
    if [[ "$i" == "$instance_name" ]]; then
      echo "$i === $instance_name is already exist name" >&2
      exit 1
    fi
  done

  read -p "Create instance?[Y/n] " confirm

  if [[ ! -z "$mount_path" ]]; then
    mount_path="--mount $mount_path"
  fi

  if [[ -z "$confirm" ||  "Y" == "$confirm" ]]; then
    create_instance
  fi

}


init_multipass
