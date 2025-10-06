// Load environment variables first
require('dotenv').config();

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const opentelemetry = require('@opentelemetry/api');

// Traceloop AI instrumentation packages
const { AnthropicInstrumentation } = require('@traceloop/instrumentation-anthropic');
const { OpenAIInstrumentation } = require('@traceloop/instrumentation-openai');

// Configure OTLP HTTP exporter
const buildHeaders = () => {
  const headers = {};
  
  // Use OTEL_EXPORTER_OTLP_HEADERS if available
  if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    headers['Authorization'] = `Basic ${process.env.OTEL_EXPORTER_OTLP_HEADERS}`;
  }
  
  return headers;
};

const otlpExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:3000/api/public/otel/v1/traces',
  headers: buildHeaders(),
});



// Initialize the SDK with auto-instrumentations and OTLP exporter
const sdk = new NodeSDK({
  traceExporter: otlpExporter,
  instrumentations: [
    new AnthropicInstrumentation(),
    new OpenAIInstrumentation(),
  ],
});

// Start the SDK
sdk.start();

console.log('OpenTelemetry instrumentation initialized with AI SDK support');
console.log(`OTLP traces will be exported to: ${process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:3000/api/public/otel/v1/traces'}`);

// Create a tracer
const tracer = opentelemetry.trace.getTracer('rag-assignment', '1.0.0');

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry terminated'))
    .catch((error) => console.log('Error terminating OpenTelemetry', error))
    .finally(() => process.exit(0));
});

// Export the tracer for use in other modules
module.exports = {
  tracer,
  sdk,
  opentelemetry,
  otlpExporter
};