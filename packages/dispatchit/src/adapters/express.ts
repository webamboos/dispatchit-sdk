import type {IncomingHttpHeaders} from 'node:http'

import type {NextFunction, Request, RequestHandler, Response} from 'express'

import type {Dispatchit} from '../config'
import {DispatchitConfigError} from '../config'

declare module 'express-serve-static-core' {
  interface Request {
    /** Raw request body captured before body parsing — required for HMAC signature verification. */
    rawBody?: string | Buffer
  }
}

/** Express request with the raw body captured by a parser-level verify hook (see the module augmentation). */
export type DispatchitRequest = Request

const missingRawBodyMessage =
  'Missing req.rawBody. Dispatchit verifies signatures against the raw request body, which body parsers consume. ' +
  'Capture it with a parser-level verify hook: express.json({verify: (req, res, buf) => {(req as DispatchitRequest).rawBody = buf}}).'

export function dispatchitExpress(instance: Dispatchit): RequestHandler {
  // Express middleware inherently receives (req, res, next).
  // oxlint-disable-next-line max-params
  return async (request, response: Response, next: NextFunction) => {
    try {
      const rawBody = (request as DispatchitRequest).rawBody
      if (rawBody === undefined) throw new DispatchitConfigError(missingRawBodyMessage)

      const result = await instance.handleRequest({
        method: request.method,
        headers: toHeaders(request.headers),
        rawBody: typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
      })

      response.status(result.status)
      result.headers.forEach((value, name) => response.set(name, value))
      response.send(await result.text())
    } catch (error) {
      next(error)
    }
  }
}

/** Converts Node's incoming headers (multi-valued, possibly undefined) into a fetch `Headers`. */
function toHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
  }
  return headers
}
