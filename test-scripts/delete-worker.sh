#!/bin/bash


cluster_list=()
selected_cluster=""
print_and_select_cluster() {
  cluster_list=$(multipass ls | grep master | awk '{print$1}')
  echo "--------------------------------"
  echo "Available Clusters"
  echo "--------------------------------"
  PS3="
👉 Select cluster to delete worker: "
  select choice in "${cluster_list[@]}"; do
    if [ -n "$choice" ]; then
      selected_cluster=$(sed -e "s/-master//g" <<< $choice)
      break
    else
      echo "⚠️  Invalid selection. Please enter a number from the list above."
    fi
  done
}

selected_worker_list=()
selected_worker=""
select_delete_worker_list() {

  echo "--------------------------------------------------------------------------------------------"
  echo -e "No\t$($CMD ls | head -n 1)"
  echo "--------------------------------------------------------------------------------------------"
  idx=1
  while IFS= read -r line; do
    echo -e "${idx}\t${line}"
    available_worker_list+=($idx)
    selected_worker_list+=($(awk '{print$1}' <<< $line))
    idx=$((idx+1))
  done < <(multipass ls | grep "${selected_cluster}-worker")
  if [ -z "$selected_worker_list" ]; then
    echo "No worker(s) found for cluster ${selected_cluster}"
    echo "--------------------------------------------------------------------------------------------"
    exit 1
  else
    echo "--------------------------------------------------------------------------------------------"
    read -p "Type number seperated by space to be deleted workers : " selected_worker
  fi
}

will_delete_worker_list=()
validate_selected_worker() {
  if [[ -z $selected_worker ]]; then
    echo "Error: No worker selected"
    exit 1
  else
    for i in ${selected_worker}; do
      if [[ "${available_worker_list[@]}" != *"${i}"* ]]; then
        echo "Error: ${selected_cluster}-worker${i} not found"
        exit 1
      elif [[ -n $i ]]; then
        will_delete_worker_list+=(${selected_worker_list[$i-1]})
      else
        echo "Error: Invalid selection. Please enter a number from the list above."
        exit 1
      fi
    done
  fi
}

confirm_delete_worker() {
  for i in ${will_delete_worker_list[@]}; do
    read -p "You will now delete '${i}' file. This action can't be undone. [Y/n]: " isApply
    if [[ -z $isApply || "Y" == $isApply ]]; then
      multipass delete ${i}
      multipass purge
      echo "${i} deleted"
    fi
  done
}

main() {
  print_and_select_cluster
  select_delete_worker_list
  validate_selected_worker
  confirm_delete_worker
}

main
