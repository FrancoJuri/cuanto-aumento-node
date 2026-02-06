import axios from 'axios';
import axiosRetry from 'axios-retry';
import https from 'https';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50, 
  maxFreeSockets: 10,
  timeout: 30000,
});

// Crear instancia de axios configurada
const httpClient = axios.create({
  timeout: 15000,
  httpsAgent: httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Connection': 'keep-alive'
  }
});

axiosRetry(httpClient, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay, 
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
           (error.response && error.response.status >= 500);
  }
});

export default httpClient;
