/**
 * Web Streams API Polyfill
 * 
 * This file provides polyfills for the Web Streams API (specifically ReadableStream)
 * which may be missing in some Node.js environments or when running with certain configurations.
 * 
 * Usage: Import this file early in your application bootstrap process:
 * require('./polyfills');
 */

import { ReadableStream, WritableStream, TransformStream } from 'web-streams-polyfill';
import fetch, {
  Blob,
  blobFrom,
  blobFromSync,
  File,
  fileFrom,
  fileFromSync,
  FormData,
  Headers,
  Request,
  Response,
} from 'node-fetch'
import 'core-js/actual/structured-clone';

// Only set globals if they don't already exist
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = ReadableStream;
  console.log('ReadableStream polyfill applied');
}

if (typeof global.WritableStream === 'undefined') {
  global.WritableStream = WritableStream as any;
  console.log('WritableStream polyfill applied');
}

if (typeof global.TransformStream === 'undefined') {
  global.TransformStream = TransformStream;
  console.log('TransformStream polyfill applied');
}

if (!global.fetch) {
  global.fetch = fetch as any
  global.Headers = Headers as any
  global.Request = Request as any
  global.Response = Response as any
}

module.exports = {
  ReadableStream,
  WritableStream,
  TransformStream
};
