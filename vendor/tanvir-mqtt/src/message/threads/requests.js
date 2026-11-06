/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: requests.js
 */

'use strict';

const { pendingRequests, approveRequest } = require('./threads');

async function getPendingRequests(client, options) {
  return pendingRequests(client, options);
}

async function getPendingCount(client) {
  const res = await client.api.request({
    endpoint: 'direct_v2/async_get_pending_requests_preview/',
    method: 'GET',
    params: { pending_inbox_filters: '[]' },
  });
  const data = res || {};
  return {
    total: Number(data.pending_requests_total || 0),
    unread: Number(data.unread_pending_requests || 0),
  };
}

module.exports = { getPendingRequests, getPendingCount, approveRequest };