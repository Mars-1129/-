import fs from 'fs';

const filePath = '/workspace/apps/server-gateway/dist/apps/server-gateway/src/posting-time/posting-time.controller.js';
let content = fs.readFileSync(filePath, 'utf8');

// Fix catch blocks: re-throw HttpException instead of returning error object
// This fixes the issue where NestJS returns 201 for POST error responses

content = content.replace(
  /catch \(error\) \{\s+return \(0, http_error_response_1\.buildApiErrorResponse\)\(error, traceId\);\s+\}/g,
  `catch (error) {
            if (error instanceof common_1.HttpException) {
                throw error;
            }
            const errResponse = (0, http_error_response_1.buildApiErrorResponse)(error, traceId);
            throw new common_1.HttpException(errResponse, error.status || error.statusCode || common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('PostingTime controller patch applied successfully!');
