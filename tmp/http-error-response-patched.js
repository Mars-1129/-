"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApiErrorResponse = buildApiErrorResponse;
const common_1 = require("@nestjs/common");
function buildApiErrorResponse(error, traceId) {
    if (error instanceof common_1.HttpException) {
        const rawResponse = error.getResponse();
        const response = normalizeHttpExceptionPayload(rawResponse);
        console.error('[ERROR-LOGGER] HttpException:', error.message, 'Status:', error.getStatus());
        return {
            success: false,
            message: response.message || '内部服务器错误',
            error: {
                code: response.error?.code || 'INTERNAL_SERVER_ERROR',
                details: response.error?.details,
                retryable: response.error?.retryable ?? false,
            },
            trace_id: traceId,
            timestamp: new Date().toISOString(),
        };
    }
    console.error('[ERROR-LOGGER] Non-HttpException caught:');
    console.error('[ERROR-LOGGER] Type:', typeof error);
    console.error('[ERROR-LOGGER] Constructor:', error?.constructor?.name);
    console.error('[ERROR-LOGGER] Message:', error?.message);
    console.error('[ERROR-LOGGER] Stack:', error?.stack?.substring(0, 1000));
    console.error('[ERROR-LOGGER] String:', String(error));
    console.error('[ERROR-LOGGER] Keys:', Object.keys(error || {}).join(', '));
    return {
        success: false,
        message: '内部服务器错误',
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            retryable: false,
        },
        trace_id: traceId,
        timestamp: new Date().toISOString(),
    };
}
function normalizeHttpExceptionPayload(rawResponse) {
    if (typeof rawResponse === 'string') {
        return { message: rawResponse };
    }
    const payload = rawResponse;
    const rawError = payload.error;
    const errorPayload = isRecord(rawError) ? rawError : undefined;
    return {
        message: typeof payload.message === 'string' ? payload.message : undefined,
        error: errorPayload
            ? {
                code: typeof errorPayload.code === 'string' ? errorPayload.code : undefined,
                details: Array.isArray(errorPayload.details) ? errorPayload.details : undefined,
                retryable: typeof errorPayload.retryable === 'boolean' ? errorPayload.retryable : undefined,
            }
            : undefined,
    };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
