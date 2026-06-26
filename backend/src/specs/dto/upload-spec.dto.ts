/**
 * The OpenAPI spec is delivered as an uploaded file (multipart field `file`),
 * handled by Nest's FileInterceptor rather than a JSON body. This DTO is kept
 * as a placeholder for optional future metadata fields sent alongside the
 * upload (e.g. a label or source note).
 */
export class UploadSpecDto {}
