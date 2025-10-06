const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const opentelemetry = require('@opentelemetry/api');

// Traceloop AI instrumentation packages
const { AnthropicInstrumentation } = require('@traceloop/instrumentation-anthropic');
const { OpenAIInstrumentation } = require('@traceloop/instrumentation-openai');
const { VertexAIInstrumentation } = require('@traceloop/instrumentation-vertexai');

// Configure OTLP HTTP exporter
const otlpExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:3000/api/public/otel/v1/traces',
  headers: {
    // Add any required headers here, e.g., API keys
    ...(process.env.OTEL_EXPORTER_OTLP_HEADERS ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : {}),
    'Authorization': 'Basic cGstdG8tMDJjNTcyNDUtMTc4Mi00NGNlLWIxODgtOTgzYTVlNDJjMTBjOnNrLXRvLTkwYTE4ZjhkLTE5MGEtNDlmNC04NGEyLTU4ODk5ZTUyODIzNg==',
  },
});

// Initialize the SDK with auto-instrumentations and OTLP exporter
const sdk = new NodeSDK({
  traceExporter: otlpExporter,
  instrumentations: [
    // new AnthropicInstrumentation(),
    new OpenAIInstrumentation(),
    new VertexAIInstrumentation(),
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