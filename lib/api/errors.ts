export type ServiceErrorKind =
  | 'not_configured'
  | 'unreachable'
  | 'not_found'
  | 'invalid_request'
  | 'invalid_response'
  | 'upstream'

const USER_MESSAGES: Record<ServiceErrorKind, string> = {
  not_configured: 'Live analysis is not enabled for this deployment yet.',
  unreachable: 'Live analysis is temporarily unreachable. Check the backend status and try again.',
  not_found: 'This analysis could not be found. It may have expired.',
  invalid_request: 'The request could not be processed.',
  invalid_response: 'The analysis service returned data in an unexpected format.',
  upstream: 'The analysis service reported an error.',
}

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind
  readonly userMessage: string
  readonly status: number

  constructor(kind: ServiceErrorKind, detail?: string, status?: number) {
    super(detail ?? USER_MESSAGES[kind])
    this.name = 'ServiceError'
    this.kind = kind
    this.userMessage = kind === 'invalid_request' && detail ? detail : USER_MESSAGES[kind]
    this.status =
      status ??
      { not_configured: 503, unreachable: 502, not_found: 404, invalid_request: 400, invalid_response: 502, upstream: 502 }[
        kind
      ]
  }
}
