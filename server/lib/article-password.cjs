/*
 * 文章密码校验。
 *
 * 数据库里只存哈希（password 列保留仅为兼容旧数据，校验通过后会原地升级成哈希）。
 * 对外一律不下发明文或哈希，只给一个 has_password 标记。
 */
const bcrypt = require('bcryptjs');
/* 文章密码：数据库里只存哈希（password 列保留仅为兼容旧数据，校验通过后会原地升级成哈希）。
 * 对外一律不下发明文或哈希，只给一个 has_password 标记。 */
const hashArticlePassword = (raw) => bcrypt.hashSync(String(raw), 10);
const verifyArticlePassword = (row, supplied) => {
  const input = String(supplied ?? '');
  if (row.password_hash) return bcrypt.compareSync(input, row.password_hash);
  if (row.password) return input === String(row.password);
  return null; // 没有设密码
};
const articleHasPassword = (row) =>
  Boolean((row.password_hash && String(row.password_hash).trim()) || (row.password && String(row.password).trim()));

module.exports = { hashArticlePassword, verifyArticlePassword, articleHasPassword };
