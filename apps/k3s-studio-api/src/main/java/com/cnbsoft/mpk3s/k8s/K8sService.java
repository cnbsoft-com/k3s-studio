package com.cnbsoft.mpk3s.k8s;

import com.cnbsoft.mpk3s.common.AppException;
import com.cnbsoft.mpk3s.cluster.Cluster;
import com.cnbsoft.mpk3s.cluster.ClusterNotFoundException;
import com.cnbsoft.mpk3s.cluster.ClusterRepository;
import com.cnbsoft.mpk3s.common.ResourceNotFoundException;
import io.fabric8.kubernetes.api.model.*;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.StatefulSet;
import io.fabric8.kubernetes.api.model.networking.v1.Ingress;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import io.fabric8.kubernetes.client.utils.Serialization;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class K8sService {

    private final ClusterRepository clusterRepository;
    private final KubernetesClientFactory clientFactory;
    private final ApplyHistoryRepository historyRepository;

    public List<String> getNamespaces(String clusterName) throws IOException {
        KubernetesClient client = client(clusterName);
        return client.namespaces().list().getItems().stream()
                .map(ns -> ns.getMetadata().getName())
                .sorted()
                .toList();
    }

    public List<K8sPodResponse> getPods(String clusterName, String namespace) throws IOException {
        KubernetesClient client = client(clusterName);
        List<Pod> pods = "all".equals(namespace)
                ? client.pods().inAnyNamespace().list().getItems()
                : client.pods().inNamespace(namespace).list().getItems();
        return pods.stream().map(this::toPodResponse).toList();
    }

    public List<K8sServiceResponse> getServices(String clusterName, String namespace) throws IOException {
        KubernetesClient client = client(clusterName);
        List<io.fabric8.kubernetes.api.model.Service> services = "all".equals(namespace)
                ? client.services().inAnyNamespace().list().getItems()
                : client.services().inNamespace(namespace).list().getItems();
        return services.stream().map(this::toServiceResponse).toList();
    }

    public List<K8sDeploymentResponse> getDeployments(String clusterName, String namespace) throws IOException {
        KubernetesClient client = client(clusterName);
        List<Deployment> deployments = "all".equals(namespace)
                ? client.apps().deployments().inAnyNamespace().list().getItems()
                : client.apps().deployments().inNamespace(namespace).list().getItems();
        return deployments.stream().map(this::toDeploymentResponse).toList();
    }

    public List<K8sConfigMapResponse> getConfigMaps(String clusterName, String namespace) throws IOException {
        KubernetesClient client = client(clusterName);
        List<ConfigMap> configMaps = "all".equals(namespace)
                ? client.configMaps().inAnyNamespace().list().getItems()
                : client.configMaps().inNamespace(namespace).list().getItems();
        return configMaps.stream().map(this::toConfigMapResponse).toList();
    }

    public List<K8sStatefulSetResponse> getStatefulSets(String clusterName, String namespace) throws IOException {
        KubernetesClient client = client(clusterName);
        List<StatefulSet> sets = "all".equals(namespace)
                ? client.apps().statefulSets().inAnyNamespace().list().getItems()
                : client.apps().statefulSets().inNamespace(namespace).list().getItems();
        return sets.stream().map(this::toStatefulSetResponse).toList();
    }

    public List<K8sIngressResponse> getIngresses(String clusterName, String namespace) throws IOException {
        KubernetesClient client = client(clusterName);
        List<Ingress> ingresses = "all".equals(namespace)
                ? client.network().v1().ingresses().inAnyNamespace().list().getItems()
                : client.network().v1().ingresses().inNamespace(namespace).list().getItems();
        return ingresses.stream().map(this::toIngressResponse).toList();
    }

    public List<K8sSecretResponse> getSecrets(String clusterName, String namespace) throws IOException {
        KubernetesClient client = client(clusterName);
        List<Secret> secrets = "all".equals(namespace)
                ? client.secrets().inAnyNamespace().list().getItems()
                : client.secrets().inNamespace(namespace).list().getItems();
        return secrets.stream().map(this::toSecretResponse).toList();
    }

    public String getPodLogs(String clusterName, String namespace, String podName, int tail) throws IOException {
        KubernetesClient client = client(clusterName);
        Pod pod = client.pods().inNamespace(namespace).withName(podName).get();
        if (pod == null) {
            throw new ResourceNotFoundException("error.resource_not_found", "pod", namespace + "/" + podName);
        }
        return client.pods().inNamespace(namespace).withName(podName).tailingLines(tail).getLog();
    }

    public String getResourceManifest(String clusterName, String resourceType,
                                       String namespace, String resourceName) throws IOException {
        if ("all".equals(namespace)) {
            throw new AppException("error.namespace_all");
        }
        KubernetesClient client = client(clusterName);
        HasMetadata resource = switch (resourceType) {
            case "pods"         -> client.pods().inNamespace(namespace).withName(resourceName).get();
            case "services"     -> client.services().inNamespace(namespace).withName(resourceName).get();
            case "deployments"  -> client.apps().deployments().inNamespace(namespace).withName(resourceName).get();
            case "configmaps"   -> client.configMaps().inNamespace(namespace).withName(resourceName).get();
            case "statefulsets" -> client.apps().statefulSets().inNamespace(namespace).withName(resourceName).get();
            case "ingresses"    -> client.network().v1().ingresses().inNamespace(namespace).withName(resourceName).get();
            case "secrets"      -> client.secrets().inNamespace(namespace).withName(resourceName).get();
            default -> throw new AppException("error.unknown_resource_type", resourceType);
        };
        if (resource == null) {
            throw new ResourceNotFoundException("error.resource_not_found", resourceType, namespace + "/" + resourceName);
        }
        stripServerMetadata(resource);
        return Serialization.asYaml(resource);
    }

    private void stripServerMetadata(HasMetadata resource) {
        ObjectMeta meta = resource.getMetadata();
        meta.setManagedFields(null);
        meta.setResourceVersion(null);
        meta.setUid(null);
        meta.setCreationTimestamp(null);
        meta.setGeneration(null);
        meta.setOwnerReferences(null);

        if (resource instanceof Pod pod) {
            pod.setStatus(null);
        } else if (resource instanceof io.fabric8.kubernetes.api.model.Service svc) {
            svc.setStatus(null);
        } else if (resource instanceof Deployment d) {
            d.setStatus(null);
        } else if (resource instanceof StatefulSet ss) {
            ss.setStatus(null);
        } else if (resource instanceof ConfigMap cm) {
            replaceBinaryData(cm);
        } else if (resource instanceof Secret secret) {
            maskSecretData(secret);
        }
    }

    private void replaceBinaryData(ConfigMap cm) {
        if (cm.getBinaryData() == null || cm.getBinaryData().isEmpty()) return;
        Map<String, String> data = cm.getData() != null ? new LinkedHashMap<>(cm.getData()) : new LinkedHashMap<>();
        cm.getBinaryData().forEach((key, base64Val) -> {
            int approxBytes = base64Val != null ? base64Val.length() * 3 / 4 : 0;
            data.put(key, "<binary: ~" + approxBytes + " bytes>");
        });
        cm.setData(data);
        cm.setBinaryData(null);
    }

    public void applyManifest(String clusterName, String yaml) throws IOException {
        KubernetesClient client = client(clusterName);
        try (var stream = new ByteArrayInputStream(yaml.getBytes(StandardCharsets.UTF_8))) {
            client.load(stream).serverSideApply();
        } catch (KubernetesClientException e) {
            saveHistory(clusterName, "apply", yaml, "failed", e.getMessage());
            throw new AppException("error.manifest_apply", e.getMessage());
        }
        saveHistory(clusterName, "apply", yaml, "success", null);
    }

    public void deleteManifest(String clusterName, String yaml) throws IOException {
        KubernetesClient client = client(clusterName);
        try (var stream = new ByteArrayInputStream(yaml.getBytes(StandardCharsets.UTF_8))) {
            client.load(stream).delete();
        } catch (KubernetesClientException e) {
            saveHistory(clusterName, "delete", yaml, "failed", e.getMessage());
            throw new AppException("error.manifest_delete", e.getMessage());
        }
        saveHistory(clusterName, "delete", yaml, "success", null);
    }

    public List<ApplyHistoryResponse> getApplyHistory(String clusterName) {
        return historyRepository.findTop20ByClusterNameOrderByExecutedAtDesc(clusterName)
                .stream().map(ApplyHistoryResponse::from).toList();
    }

    private void saveHistory(String clusterName, String action, String yaml, String result, String errorMsg) {
        ApplyHistory h = new ApplyHistory();
        h.setClusterName(clusterName);
        h.setAction(action);
        h.setYamlContent(yaml);
        h.setResult(result);
        h.setErrorMessage(errorMsg);
        h.setExecutedAt(OffsetDateTime.now());
        historyRepository.save(h);
    }

    // ── private helpers ────────────────────────────────────────────────────

    private KubernetesClient client(String clusterName) throws IOException {
        Cluster cluster = clusterRepository.findByName(clusterName)
                .orElseThrow(() -> new ClusterNotFoundException(clusterName));
        return clientFactory.clientFor(cluster);
    }

    private K8sPodResponse toPodResponse(Pod pod) {
        ObjectMeta meta = pod.getMetadata();
        PodStatus status = pod.getStatus();
        List<ContainerStatus> containerStatuses = status.getContainerStatuses();
        int ready = (int) containerStatuses.stream().filter(ContainerStatus::getReady).count();
        int total = containerStatuses.size();
        return new K8sPodResponse(
                meta.getName(),
                meta.getNamespace(),
                status.getPhase(),
                ready + "/" + total,
                age(meta.getCreationTimestamp()),
                status.getHostIP());
    }

    private K8sServiceResponse toServiceResponse(io.fabric8.kubernetes.api.model.Service svc) {
        ObjectMeta meta = svc.getMetadata();
        ServiceSpec spec = svc.getSpec();
        String ports = spec.getPorts().stream()
                .map(p -> p.getPort() + "/" + p.getProtocol())
                .reduce((a, b) -> a + ", " + b).orElse("-");
        return new K8sServiceResponse(
                meta.getName(),
                meta.getNamespace(),
                spec.getType(),
                spec.getClusterIP(),
                ports,
                age(meta.getCreationTimestamp()));
    }

    private K8sDeploymentResponse toDeploymentResponse(Deployment d) {
        ObjectMeta meta = d.getMetadata();
        var status = d.getStatus();
        int desired = d.getSpec().getReplicas() != null ? d.getSpec().getReplicas() : 0;
        int ready = status.getReadyReplicas() != null ? status.getReadyReplicas() : 0;
        int upToDate = status.getUpdatedReplicas() != null ? status.getUpdatedReplicas() : 0;
        int available = status.getAvailableReplicas() != null ? status.getAvailableReplicas() : 0;
        return new K8sDeploymentResponse(
                meta.getName(),
                meta.getNamespace(),
                ready + "/" + desired,
                upToDate,
                available,
                age(meta.getCreationTimestamp()));
    }

    private K8sConfigMapResponse toConfigMapResponse(ConfigMap cm) {
        ObjectMeta meta = cm.getMetadata();
        int dataCount = cm.getData() != null ? cm.getData().size() : 0;
        return new K8sConfigMapResponse(
                meta.getName(),
                meta.getNamespace(),
                dataCount,
                age(meta.getCreationTimestamp()));
    }

    private K8sStatefulSetResponse toStatefulSetResponse(StatefulSet ss) {
        ObjectMeta meta = ss.getMetadata();
        var status = ss.getStatus();
        int desired = ss.getSpec().getReplicas() != null ? ss.getSpec().getReplicas() : 0;
        int ready = status != null && status.getReadyReplicas() != null ? status.getReadyReplicas() : 0;
        return new K8sStatefulSetResponse(meta.getName(), meta.getNamespace(), ready + "/" + desired, age(meta.getCreationTimestamp()));
    }

    private K8sIngressResponse toIngressResponse(Ingress ingress) {
        ObjectMeta meta = ingress.getMetadata();
        String hosts = ingress.getSpec().getRules() == null ? "-" :
                ingress.getSpec().getRules().stream()
                        .map(r -> r.getHost() != null ? r.getHost() : "*")
                        .reduce((a, b) -> a + ", " + b).orElse("-");
        return new K8sIngressResponse(meta.getName(), meta.getNamespace(), hosts, age(meta.getCreationTimestamp()));
    }

    private K8sSecretResponse toSecretResponse(Secret secret) {
        ObjectMeta meta = secret.getMetadata();
        int dataCount = secret.getData() != null ? secret.getData().size() : 0;
        return new K8sSecretResponse(meta.getName(), meta.getNamespace(), secret.getType(), dataCount, age(meta.getCreationTimestamp()));
    }

    private void maskSecretData(Secret secret) {
        if (secret.getData() == null || secret.getData().isEmpty()) return;
        Map<String, String> masked = new LinkedHashMap<>();
        secret.getData().forEach((key, val) -> masked.put(key, "<secret>"));
        secret.setData(null);
        secret.setStringData(masked);
    }

    private String age(String creationTimestamp) {
        if (creationTimestamp == null) return "-";
        try {
            OffsetDateTime created = OffsetDateTime.parse(creationTimestamp, DateTimeFormatter.ISO_OFFSET_DATE_TIME);
            Duration d = Duration.between(created, OffsetDateTime.now());
            if (d.toDays() > 0) return d.toDays() + "d";
            if (d.toHours() > 0) return d.toHours() + "h";
            return d.toMinutes() + "m";
        } catch (Exception e) {
            return "-";
        }
    }
}
