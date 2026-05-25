import axios, { AxiosInstance } from "axios";

const apiUrl = process.env.K3S_STUDIO_API_URL ?? "http://localhost:8080";
const apiKey = process.env.K3S_STUDIO_API_KEY;

export const http: AxiosInstance = axios.create({
  baseURL: apiUrl,
  headers: {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-Api-Key": apiKey } : {}),
  },
  timeout: 10_000,
});

// Ollama API calls can take minutes (model inference, pull). Use a separate instance.
const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";

export const ollamaHttp: AxiosInstance = axios.create({
  baseURL: ollamaUrl,
  headers: { "Content-Type": "application/json" },
  timeout: 300_000,
});
