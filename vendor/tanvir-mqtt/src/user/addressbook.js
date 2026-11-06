/*
 * Author: Tanvir Ahmed (tanvir143)
 * File Name: addressbook.js
 */

'use strict';

const DEFAULT_INCLUDE = ['extra_display_name', 'thumbnails'];

function serializeInclude(include) {
  if (include === undefined || include === null) {
    return DEFAULT_INCLUDE.join(',');
  }
  if (typeof include === 'string') {
    return include;
  }
  return include.map(String).join(',');
}

function userLog(client, ...args) {
  if (client.clientLog && typeof client.clientLog.debug === 'function') {
    client.clientLog.debug('[USER]', ...args);
  }
}

async function linkAddressBook(client, contacts, include) {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    throw new Error('tanvir-mqtt: linkAddressBook needs non-empty contacts array');
  }
  const includeValue = serializeInclude(include);
  const data = {
    contacts: JSON.stringify(contacts),
    _uuid: client.uuid,
  };
  if (client.userId) {
    data._uid = String(client.userId);
  }
  userLog(client, 'linking address book (' + contacts.length + ' contacts) — explicit upload');
  const params = includeValue ? { include: includeValue } : null;
  return client.api.request({ endpoint: 'address_book/link/', method: 'POST', params, data });
}

async function unlinkAddressBook(client) {
  return client.api.request({
    endpoint: 'address_book/unlink/',
    method: 'POST',
    data: { _uuid: client.uuid },
  });
}

module.exports = { DEFAULT_INCLUDE, linkAddressBook, unlinkAddressBook };