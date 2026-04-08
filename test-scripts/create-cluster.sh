#!/bin/sh

if [ -z $1 ]; then
    echo "Set context name USAGE: context_name[ex:] worker_size[default: 2]"
    exit 1
fi

CONTEXT_NAME=$1
WORKER_SIZE=${2:-2}
IMAGE=ubuntu-22.04
NETWORK_NAME=$(multipass networks | grep en0 | awk '{print $1}')
set -e


echo "Context name: ${CONTEXT_NAME}"
echo "NETWORK_NAME name: ${NETWORK_NAME}"
echo "WORKER SIZE: $WORKER_SIZE"

echo "Launching master node..."

## 예시 1: etcd + flannel (기본 vxlan)
### curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--cluster-init" sh -
## 예시 2: etcd + flannel 제거 + Calico를 직접 설치할 준비
### curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--cluster-init --flannel-backend=none --disable-network-policy" sh -
### curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--cluster-init --disable=traefik" sh -
if [ -z INSTALL_K3S_EXEC ];then
  INSTALL_K3S_EXEC="--cluster-init"
else
  INSTALL_K3S_EXEC="--cluster-init ${INSTALL_K3S_EXEC}"
fi

echo "INSTALL_K3S_EXEC is ${INSTALL_K3S_EXEC}"

cat > .master.yaml <<EOF
package_update: true
image: ${IMAGE}
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

for i in $(seq 1 $WORKER_SIZE); do
  cat > .worker-${i}.yaml <<EOF
package_update: true
image: ${IMAGE}
packages:
  - curl
runcmd:
  - curl -sfL https://get.k3s.io | K3S_URL=https://${MASTER_IP}:6443 K3S_TOKEN=${NODE_TOKEN} sh -
EOF
  echo "Launching ${i} worker node"
  multipass launch --name ${CONTEXT_NAME}-worker${i} --cpus 2 --memory 2G --disk 10G --network ${NETWORK_NAME} --cloud-init .worker-${i}.yaml
  rm -f ./.worker-${i}.yaml
done


echo "All nodes created. Checking cluster state..."

multipass exec ${CONTEXT_NAME}-master -- sudo kubectl get nodes

echo "Generate k8s config file"
# multipass exec ${CONTEXT_NAME}-master -- sudo cat /etc/rancher/k3s/k3s.yaml | sed -e "s/127.0.0.1/$MASTER_IP/g" -e "s/cluster:\ default/cluster:\ ${CONTEXT_NAME}-cluster/g" -e "s/default/${CONTEXT_NAME}-context/g" > $HOME/.kube/config-${CONTEXT_NAME}
multipass exec ${CONTEXT_NAME}-master -- sudo cat /etc/rancher/k3s/k3s.yaml | sed -e "s/127.0.0.1/$MASTER_IP/g" -e "s/default/${CONTEXT_NAME}-context/g" > $HOME/.kube/config-${CONTEXT_NAME}

echo "Add following message you're KUBECONFIG env."
echo "\$HOME/.kube/config-${CONTEXT_NAME}"
