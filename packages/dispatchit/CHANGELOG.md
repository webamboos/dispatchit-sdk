# dispatchit

## 1.1.0

### Minor Changes

- [#1](https://github.com/webamboos/dispatchit-sdk/pull/1) [`9411a15`](https://github.com/webamboos/dispatchit-sdk/commit/9411a15aad4df60c9cc3cc0b81e387d6e6eeb005) Thanks [@arpadgabor](https://github.com/arpadgabor)! - Adds an Express adapter. Import `dispatchitExpress` from `dispatchit/adapters/express` and mount it on any Express 4 or 5 app.

  Because Express parses the request body before your middleware runs, the adapter needs the raw body to verify signatures. Capture it with a verify hook when you configure `express.json`, then mount the adapter after it:

  ```ts
  app.use(
    '/api/webhooks/dispatchit',
    express.json({
      verify: (req, res, buf) => {
        ;(req as DispatchitRequest).rawBody = buf
      },
    }),
    dispatchitExpress(config)
  )
  ```
