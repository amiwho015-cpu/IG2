export function remember(map, key, value, maximum) {
  map.delete(key);
  map.set(key, value);
  if (map.size > maximum) map.delete(map.keys().next().value);
}
