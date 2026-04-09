const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const wsProtocol = API_URL.startsWith("https") ? "wss" : "ws";
const wsHost = API_URL.replace(/^https?:\/\//, "");

export const API_BASE_URL = API_URL;
export const WS_BASE_URL = `${wsProtocol}://${wsHost}`;
