export function formatResult(value) {
  const serialized = JSON.stringify(value, (key, entry) => {
    if (/cookie|token|password|secret|authorization|mediaKey/i.test(key)) return '[đã ẩn]';
    return typeof entry === 'bigint' ? entry.toString() : entry;
  }, 2) ?? 'Không có dữ liệu.';
  return serialized.length > 3500 ? `${serialized.slice(0, 3500)}\n… (rút gọn)` : serialized;
}
