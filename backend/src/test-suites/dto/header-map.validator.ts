import { registerDecorator, ValidationOptions } from 'class-validator';

const MAX_HEADERS = 20;
const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 4000;
// RFC 7230 "token" — the set of characters a header field-name may use.
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Validates a plain `Record<string, string>` of HTTP headers: entry count,
 * key charset (RFC 7230 token), and CRLF-injection guards on both sides,
 * since these values flow straight into outbound request headers.
 */
export function IsHeaderMap(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHeaderMap',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'Custom headers must be an object of at most 20 header name/value string pairs, with valid header names and no line breaks in values',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined) return true;
          if (
            typeof value !== 'object' ||
            value === null ||
            Array.isArray(value)
          ) {
            return false;
          }

          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length > MAX_HEADERS) return false;

          return entries.every(([key, val]) => {
            if (
              typeof key !== 'string' ||
              key.length === 0 ||
              key.length > MAX_KEY_LENGTH ||
              !HEADER_NAME_PATTERN.test(key)
            ) {
              return false;
            }
            if (typeof val !== 'string' || val.length > MAX_VALUE_LENGTH) {
              return false;
            }
            return !/[\r\n]/.test(val);
          });
        },
      },
    });
  };
}
