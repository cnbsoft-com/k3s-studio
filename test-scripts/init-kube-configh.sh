#!/bin/sh


init_kubeconfig(){
  if [ -f "$HOME/.kube-config.sh" ]; then
    echo "Kubeconfig exists"
  else
    cat << EOF > $HOME/.kube-config.sh
#!/bin/sh

KUBE_ROOT=$HOME/.kube
unset KUBECONFIG
KUBECONFIG=''

if [ -d $KUBE_ROOT ]; then
  for i in $(ls -al $KUBE_ROOT | grep config | grep -v "~" | awk '{print$9}'); do
    if [ -z $KUBECONFIG ]; then
      KUBECONFIG=${KUBE_ROOT}/${i}
    else
      KUBECONFIG=${KUBECONFIG}:${KUBE_ROOT}/${i}
    fi
  done
fi
export KUBECONFIG=$KUBECONFIG
EOF
    chmod +x $HOME/.kube-config.sh
    echo "Kubeconfig created"
    echo "Add 'source $HOME/.kube-config.sh' to your .zshrc or .zprofile file"
  fi
}

init_kubeconfig
