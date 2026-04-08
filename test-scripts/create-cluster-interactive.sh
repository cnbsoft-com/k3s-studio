#!/bin/bash

# k3s 클러스터 생성 스크립트
set -e

# Cleanup
cleanup() {
  echo "임시 생성 파일 정리"
  rm -rf ./.master.yaml ./.worker-*.yaml ./.k3s-tls-san-*.yaml
}

validate_multipass_cmd() {
  echo "### Validating multipass command.. ###"
  if ! command -v multipass &> /dev/null; then
    echo "multipass command not found. Please install multipass first."
    exit 1
  else
    echo "multipass command found."
  fi
}

trap cleanup EXIT ERR



set_context_name() {
  read -p "Enter context name(Conext name will be used as k8s cluster name and multipass instance prefix): " CONTEXT_NAME
  echo "Context name is ${CONTEXT_NAME}"

  if [ -z $CONTEXT_NAME ]; then
    echo "Error: Context name is required"
    set_context_name
  else
    check_duplicate_context_name
  fi
}

check_duplicate_context_name() {
  if [ $(multipass ls | grep ^${CONTEXT_NAME}-master | wc -l) -ne 0 ]; then
    echo "Error: Context name is aleady used. Please use another name."
    set_context_name
  fi
}

set_worker_size() {
  read -p "Enter worker size(default: 2): " WORKER_SIZE
  if [ -z $WORKER_SIZE ]; then
    WORKER_SIZE=2
  fi
}

set_network_name() {
  NETWORK_NAME=$(multipass networks | grep en0 | awk '{print $1}')
}

# --- ADD: Multipass 이미지 선택 및 multipass 래퍼 ---

# 사용자가 IMAGE/MULTIPASS_IMAGE를 미지정 시 인터랙티브로 이미지 선택
select_multipass_image() {
  echo "Searching for Ubuntu images..."
  CMD="multipass"

  IMAGES=()
  while IFS= read -r line; do
      # Only include lines where the description contains "Ubuntu"
      if [[ "$line" == *"Ubuntu"* ]]; then
          IMAGES+=("$line")
      fi
  done < <($CMD find)

  # Check if we found any images
  if [ ${#IMAGES[@]} -eq 0 ]; then
      echo "❌ No Ubuntu images found."
      exit 1
  fi

  echo ""
  echo "📋 Available Ubuntu Images:"
  echo "--------------------------------------------------------------------------------"
  # Print header for reference
  $CMD find | head -n 1
  echo "--------------------------------------------------------------------------------"

  # Set prompt for selection
  PS3="
  👉 Select an image number (or 'q' to quit): "

  # Provide selection menu
  select choice in "${IMAGES[@]}"; do
      if [[ "$REPLY" == "q" ]]; then
          echo "👋 Exiting..."
          exit 0
      elif [ -n "$choice" ]; then
          # Extract the first column (Image/Alias) as the selected image name
          IMAGE=$(echo "$choice" | awk '{print $1}')
          SELECTED_IMAGE=$choice

          echo ""
          echo "✅ Selection Confirmed!"
          echo "------------------------------------------------"
          echo "Selected Image: $IMAGE"
          echo "Full Detail   : $choice"
          echo "------------------------------------------------"
          break
      else
          echo "⚠️  Invalid selection. Please enter a number from the list above."
      fi
  done
  # echo "Choice image: ${SELECTED_IMAGE}"
  # return 0
}


built_in_specs=(
  "2cpus, 2G memory, 10G disk"
  "4cpus, 4G memory, 20G disk"
  "8cpus, 8G memory, 40G disk"
  "Custom"
)

built_in_spec_map=(
  "--cpus 2 --memory 2G --disk 10G"
  "--cpus 4 --memory 4G --disk 20G"
  "--cpus 8 --memory 8G --disk 40G"
)

set_custom_master_spec() {
  read -p "Enter cpu count: " CPU_COUNT
  read -p "Enter memory size: " MEMORY_SIZE
  read -p "Enter disk size: " DISK_SIZE

  if ! echo "$CPU_COUNT" | grep -Eq '^[0-9]+$'; then
    echo "Invalid cpu count"
    set_custom_master_spec
  fi

  if ! echo "$MEMORY_SIZE" | grep -Eq '^[0-9]+$'; then
    echo "Invalid memory size"
    set_custom_master_spec
  fi

  if ! echo "$DISK_SIZE" | grep -Eq '^[0-9]+$'; then
    echo "Invalid disk size"
    set_custom_master_spec
  fi

  MASTER_SPEC="--cpus ${CPU_COUNT} --memory ${MEMORY_SIZE}G --disk ${DISK_SIZE}G"
  echo "MASTER_SPEC is ${MASTER_SPEC}"
}

set_master_spec () {
  PS3="
  👉 Select master spec : "
  select choice in "${built_in_specs[@]}"; do
    if [ "$REPLY" == "4" ]; then
      set_custom_master_spec
      break
    elif [ -n "$choice" ]; then
      MASTER_SPEC=${built_in_spec_map[$REPLY-1]}
      break
    else
      echo "⚠️ Invalid selection. Please enter a number from the list above."
    fi
  done
}

set_custom_worker_spec() {
  read -p "Enter cpu count: " CPU_COUNT
  read -p "Enter memory size: " MEMORY_SIZE
  read -p "Enter disk size: " DISK_SIZE

  if ! echo "$CPU_COUNT" | grep -Eq '^[0-9]+$'; then
    echo "Invalid cpu count"
    set_custom_worker_spec
  fi

  if ! echo "$MEMORY_SIZE" | grep -Eq '^[0-9]+$'; then
    echo "Invalid memory size"
    set_custom_worker_spec
  fi

  if ! echo "$DISK_SIZE" | grep -Eq '^[0-9]+$'; then
    echo "Invalid disk size"
    set_custom_worker_spec
  fi

  WORKER_SPEC="--cpus ${CPU_COUNT} --memory ${MEMORY_SIZE}G --disk ${DISK_SIZE}G"
  echo "WORKER_SPEC is ${WORKER_SPEC}"
}

set_worker_spec () {
  PS3="
  👉 Select worker spec : "
  select choice in "${built_in_specs[@]}"; do
    if [ "$REPLY" == "4" ]; then
      set_custom_worker_spec
      break
    elif [ -n "$choice" ]; then
      WORKER_SPEC=${built_in_spec_map[$REPLY-1]}
      break
    else
      echo "⚠️ Invalid selection. Please enter a number from the list above."
    fi
  done
}

set_install_k3s_exec() {
  ## 예시 1: etcd + flannel (기본 vxlan)
  ### curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--cluster-init" sh -
  ## 예시 2: etcd + flannel 제거 + Calico를 직접 설치할 준비
  ### curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--cluster-init --flannel-backend=none --disable-network-policy" sh -
  ### curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--cluster-init --disable=traefik" sh -
  # traefik 비활성화 (Istio 사용을 위해)

  read -p "Use traefik(default: y)? (y/n). If you use istio, disable traefik: " use_traefik
  read -p "Use flannel(default: y)? (y/n): " use_flannel
  read -p "Use servicelb(default: y)? (y/n): " use_servicelb
  read -p "Use local storage(default: y)? (y/n): " use_local
  read -p "Use metrics-server(default: y)? (y/n): " use_metrics_server

  if [ "$use_traefik" = "n" ]; then
    INSTALL_K3S_EXEC="--cluster-init --disable=traefik"
  else
    INSTALL_K3S_EXEC="--cluster-init"
  fi

  if [ "$use_flannel" = "n" ]; then
    INSTALL_K3S_EXEC="${INSTALL_K3S_EXEC} --flannel-backend=none --disable-network-policy"
  fi

  if [ "$use_servicelb" = "n" ]; then
    INSTALL_K3S_EXEC="${INSTALL_K3S_EXEC} --disable=servicelb"
  fi

  if [ "$use_local" = "n" ]; then
    INSTALL_K3S_EXEC="${INSTALL_K3S_EXEC} --disable=local-storage"
  fi

  if [ "$use_metrics_server" = "n" ]; then
    INSTALL_K3S_EXEC="${INSTALL_K3S_EXEC} --disable=metrics-server"
  fi

  echo "INSTALL_K3S_EXEC is ${INSTALL_K3S_EXEC}"
}

create_master() {
  cat > .master.yaml <<EOF
package_update: true
packages:
  - curl
runcmd:
  - curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="${INSTALL_K3S_EXEC}" sh -
  - mkdir -p /etc/k3s
EOF

  multipass launch --name ${CONTEXT_NAME}-master --cpus 2 --memory 2G --disk 10G --network ${NETWORK_NAME} --cloud-init .master.yaml
  rm -f ./.master.yaml
  echo "Initializing k3s..."
  MASTER_IP=$(multipass exec ${CONTEXT_NAME}-master -- hostname -I | awk '{print $1}')
  NODE_TOKEN=$(multipass exec ${CONTEXT_NAME}-master -- sudo cat /var/lib/rancher/k3s/server/node-token)
}

create_workers() {
  for i in $(seq 1 $WORKER_SIZE); do
    cat > .worker-${i}.yaml <<EOF
package_update: true
packages:
  - curl
runcmd:
  - curl -sfL https://get.k3s.io | K3S_URL=https://${MASTER_IP}:6443 K3S_TOKEN=${NODE_TOKEN} sh -
EOF
    echo "Launching ${i} worker node"
    multipass launch --name ${CONTEXT_NAME}-worker${i} ${WORKER_SPEC} --network ${NETWORK_NAME} --cloud-init .worker-${i}.yaml
    rm -f ./.worker-${i}.yaml
  done

  echo "All nodes created. Checking cluster state..."
}

create_k8s_config() {
  multipass exec ${CONTEXT_NAME}-master -- sudo kubectl get nodes
  echo "Generate k8s config file"
# multipass exec ${CONTEXT_NAME}-master -- sudo cat /etc/rancher/k3s/k3s.yaml | sed -e "s/127.0.0.1/$MASTER_IP/g" -e "s/cluster:\ default/cluster:\ ${CONTEXT_NAME}-cluster/g" -e "s/default/${CONTEXT_NAME}-context/g" > $HOME/.kube/config-${CONTEXT_NAME}
  multipass exec ${CONTEXT_NAME}-master -- sudo cat /etc/rancher/k3s/k3s.yaml | sed -e "s/127.0.0.1/$MASTER_IP/g" -e "s/default/${CONTEXT_NAME}-context/g" > $HOME/.kube/config-${CONTEXT_NAME}
  echo "Add following message you're KUBECONFIG env."
  echo "\$HOME/.kube/config-${CONTEXT_NAME}"
}

print_info() {
  echo "Context name: ${CONTEXT_NAME}"
  echo "NETWORK_NAME name: ${NETWORK_NAME}"
  echo "WORKER SIZE: $WORKER_SIZE"
  echo "Multipass image: ${IMAGE}"

  read -p "Create cluster? (y/n): " create_cluster
  if [ "$create_cluster" != "y" ]; then
    echo "Aborting..."
    exit 1
  fi
}

validate_multipass_cmd
set_context_name
set_master_spec
set_worker_size
set_worker_spec
set_network_name

select_multipass_image
set_install_k3s_exec
print_info

create_master
create_workers
create_k8s_config

