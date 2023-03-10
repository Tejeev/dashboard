// eslint-disable-next-line no-unused-vars
import basicWorkerConstructor from '@shell/plugins/steve/worker/web-worker.basic.js';
// eslint-disable-next-line no-unused-vars
import advancedWorkerConstructor from '@shell/plugins/steve/worker/web-worker.advanced.js';

export default function storeWorker(mode, options = {}, closures = {}) {
  let worker;

  /**
   * Make a http request, create a cached promise and return the promise.
   *
   * The returned promise will be resolved once we receive notification of a result from the worker thread
   */
  const postMessageAndWait = function(params) {
    // The rough chain of events are..
    // 1) `postMessageAndWait`
    // - This creates a promise with a hash to identify the request
    // - Sends message `waitingForResponse` to the worker thread
    // - Returns the promise
    // ------ ui / worker thread divide ------
    // 2) Worker thread action handles `waitingForResponse` and passes on to another worker thread action `request`
    // - This passes in a callback that is executed once the API request is completed
    // 3) Worker thread action handles `request` and calls `state.api.request`
    // - state.api is a SteveApiClient instance
    // 4) SteveApiClient `request` makes http request and triggers callback
    // - callback sends message `awaitedResponse` to UI thread
    // ------ ui / worker thread divide ------
    // 5) Subscribe instance handles `awaitedResponse`
    // - This locates the promise from above and resolves it

    const {
      type, id, namespace, selector, limit, filter, sortBy, sortOrder
    } = params;

    try {
      const requestParams = JSON.parse(JSON.stringify({
        type,
        id,
        namespace,
        selector,
        limit,
        filter,
        sortBy,
        sortOrder
      }));
      const requestHash = JSON.stringify(requestParams);

      if (worker.requests[requestHash]) {
        // TODO: RC Discuss - not sure we want to error here, anyway to pass back the original promise? make a new one and chain, etc?
        throw new Error('duplicate request is already active');
      }

      worker.requests[requestHash] = {
        resolves: undefined, reject: undefined, promise: undefined
      };

      // These are tidied up when there's a response over at `awaitedResponse`
      worker.requests[requestHash].promise = new Promise((resolve, reject) => {
        worker.requests[requestHash].resolves = (resources) => {
          resolve(resources);
        };
        worker.requests[requestHash].reject = (error) => {
          reject(error);
        };

        worker.postMessage({
          waitingForResponse: {
            requestHash,
            params: requestParams
          }
        });
      });

      return worker.requests[requestHash].promise;
    } catch (err) {
      return Promise.reject(err);
    }
  };

  if (mode === 'advanced') {
    worker = new advancedWorkerConstructor();
    worker.requests = {};
    worker.postMessageAndWait = postMessageAndWait;
  } else {
    worker = new basicWorkerConstructor();
  }
  worker.mode = mode;

  return worker;
}
