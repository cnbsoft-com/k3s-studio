#!/bin/bash
set -e

set CONTEXT_NAME

WORKER_SIZE=${2:-1}

CMD="multipass"

cleanup() {
  # echo "임시 생성 파일 정리"
  rm -rf ./.worker-*.yaml
}


select_cluster() {
    CLUSTERS=()

    while IFS= read -r line; do
        CLUSTERS+=("$line")
    done < <($CMD ls | grep master | awk '{print $1}')

    if [ ${#CLUSTERS[@]} -eq 0 ]; then
        echo "No clusters found. Exiting..."
        exit 1
    fi

    echo ""
    echo "📋 Available Ubuntu Images:"
    echo "--------------------------------------------------------------------------------"
    # Print header for reference
    $CMD ls | head -n 1
    echo "--------------------------------------------------------------------------------"

    PS3="
    👉 Select an cluster number (or 'q' to quit): "

    select choice in "${CLUSTERS[@]}"; do
      if [[ "$REPLY" == "q" || "$REPLY" == "Q" ]]; then
        echo "👋 Exiting..."
        exit 0
      elif [ -n "$choice" ]; then
        CONTEXT_NAME=$(sed -e "s/-master//g" <<< "${choice}")
        break
      else
        echo "⚠️  Invalid selection. Please enter a number from the list above."
      fi
    done
}

set_worker_size() {
  read -p "Enter worker size(default: 1): " WORKER_SIZE
  if [ -z $WORKER_SIZE ]; then
    WORKER_SIZE=1
  fi
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

set_custom_spec() {
  read -p "Enter cpu count: " CPU_COUNT
  read -p "Enter memory size: " MEMORY_SIZE
  read -p "Enter disk size: " DISK_SIZE

  if ! echo "$CPU_COUNT" | grep -Eq '^[0-9]+$'; then
    echo "Invalid cpu count"
    set_custom_spec
  fi

  if ! echo "$MEMORY_SIZE" | grep -Eq '^[0-9]+$'; then
    echo "Invalid memory size"
    set_custom_spec
  fi

  if ! echo "$DISK_SIZE" | grep -Eq '^[0-9]+$'; then
    echo "Invalid disk size"
    set_custom_spec
  fi

  WORKER_SPEC="--cpus ${CPU_COUNT} --memory ${MEMORY_SIZE}G --disk ${DISK_SIZE}G"
  echo "WORKER_SPEC is ${WORKER_SPEC}"
}

set_worker_spec() {
  select choice in "${built_in_specs[@]}"; do
    if [ "$REPLY" == "4" ]; then
      set_custom_spec
      break
    elif [ -n "$choice" ]; then
      WORKER_SPEC=${built_in_spec_map[$REPLY-1]}
      break
    else
      echo "⚠️ Invalid selection. Please enter a number from the list above."
    fi
  done
}


confirm_add_worker() {
  read -p "Are you sure you want to add $WORKER_SIZE worker(s) to ${CONTEXT_NAME}-cluster? (y/n): " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Exiting..."
    exit 0
  fi
}


set_master_name() {
    MASTER_NAME=${CONTEXT_NAME}-master
    if [ -z $MASTER_NAME ]; then
        echo "Not found master name[$1]"
        exit 1
    fi
}

set_vm_image() {
    VM_IMAGE=$(multipass ls | grep ^${CONTEXT_NAME}-master | awk '{print $5}')
    if [ -z $VM_IMAGE ]; then
        echo "Not found vm image[$1]"
        exit 1
    fi
}

set_worker_start_number() {
  LAST_WORKER_NUMBER=1
  for i in $(multipass ls | grep ^${CONTEXT_NAME}-worker | wc -l | awk '{print $1}'); do
    LAST_WORKER_NUMBER=$(sed -e "s/${CONTEXT_NAME}-worker//g" <<< "${i}")
  done
}

set_network_name() {
    NETWORK_NAME=$(multipass networks | grep en0 | awk '{print $1}')
}

set_master_ip() {
    MASTER_IP=$(multipass exec ${CONTEXT_NAME}-master -- hostname -I | awk '{print $1}')
}

set_node_token() {
    NODE_TOKEN=$(multipass exec ${CONTEXT_NAME}-master -- sudo cat /var/lib/rancher/k3s/server/node-token)
}

set_start_end_number() {
    START_NUMBER=$(( $LAST_WORKER_NUMBER + 1 ))
    END_NUMBER=$(( $LAST_WORKER_NUMBER + $WORKER_SIZE))

    echo "START_NUMBER is ${START_NUMBER}"
    echo "END_NUMBER is ${END_NUMBER}"
}

create_workers() {
  for i in $(seq $START_NUMBER $END_NUMBER); do
    cat > .worker-${i}.yaml <<EOF
package_update: true
image: ${VM_IMAGE}
packages:
  - curl
runcmd:
  - curl -sfL https://get.k3s.io | K3S_URL=https://${MASTER_IP}:6443 K3S_TOKEN=${NODE_TOKEN} sh -
EOF

echo "${CONTEXT_NAME}-worker${i} ${WORKER_SPEC} ${NETWORK_NAME} ${VM_IMAGE}"
    multipass launch --name ${CONTEXT_NAME}-worker${i} ${WORKER_SPEC} --network ${NETWORK_NAME} --cloud-init .worker-${i}.yaml
    rm -f ./.worker-${i}.yaml
  done
}

print_cluster_state() {
  echo ""
  echo "📋 Cluster State:"
  echo "--------------------------------------------------------------------------------"
  multipass exec ${CONTEXT_NAME}-master -- sudo kubectl get nodes
  echo "--------------------------------------------------------------------------------"
}

trap cleanup EXIT ERR

select_cluster
set_worker_size
set_worker_spec
confirm_add_worker
set_master_name
set_worker_start_number
set_vm_image
set_network_name
set_master_ip
set_node_token
set_start_end_number
create_workers
print_cluster_state

