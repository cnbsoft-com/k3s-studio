#!/bin/sh

set cluster_name, domain, temp_file_name, isApply

readClusterName() {
  read -p "cluster name : " cluster_name
  temp_file_name="${cluster_name}_config.txt"
}

readDomainName(){
  read -p "domain name[not mandatory] : " domain
}

confirmTypeInfo(){
  echo "Cluster Name is ${cluster_name}"
  if [[ ! -z $domain ]]; then
    echo "Domain is ${domain}"
  fi

  read -p "Apply config?[Y/n]" isApply
}

writeTempTlsSanConfig(){
  echo "tls-san:" > $temp_file_name
  if [[ ! -z $domain ]]; then
    echo "  - $domain" >> $temp_file_name
  fi

  for i in $(multipass exec ${cluster_name}-master -- ip a | grep -v grep | grep enp | grep inet | awk '{print$2}' | awk -F/ '{print$1}'); do
    config="${config}  - ${i}\r\n"
    cat<<EOF >> $temp_file_name
  - ${i}
EOF
  done
}

applyTlsSanConfig(){
  cat $temp_file_name | multipass exec ${cluster_name}-master -- sudo tee /etc/rancher/k3s/config.yaml
  rm -rf $temp_file_name
  echo "restarting k3s service..."
  multipass exec ${cluster_name}-master -- sudo systemctl restart k3s
  echo "finished job"
}


readClusterName
readDomainName
confirmTypeInfo

if [[ -z $isApply || "Y" == $isApply ]]; then
  writeTempTlsSanConfig
  applyTlsSanConfig
fi
exit 0

