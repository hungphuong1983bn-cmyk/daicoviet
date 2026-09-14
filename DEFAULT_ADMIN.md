# Tài khoản Admin mặc định (DEVELOPMENT ONLY)

```
Username: admin
Password: Admin@123456
```

Tài khoản này được tự động tạo (seed) trong `localStorage` của trình
duyệt khi ai đó mở `/admin/login.html` lần đầu tiên và collection
`adminUsers` chưa có dữ liệu (xem `DataService.ensureDefaultAdmin()`
trong `shared/data-service.js`).

## ⚠️ Bắt buộc đọc trước khi dùng thật

1. **Đổi mật khẩu ngay khi đăng nhập lần đầu.** Sau khi đăng nhập, vào
   nút **"Đổi mật khẩu"** ở góc trên bên phải Admin Dashboard. Hệ
   thống sẽ nhắc bạn (`mustChangePassword: true`) cho đến khi bạn đổi.
2. **Đây KHÔNG phải xác thực an toàn cho production.** Toàn bộ logic
   kiểm tra mật khẩu chạy trong trình duyệt của chính người dùng
   (frontend-only). Mật khẩu được băm bằng SHA-256 + salt trước khi
   lưu (không lưu plaintext), nhưng vì mã nguồn và dữ liệu đã băm đều
   nằm trong tay người dùng, một người có chủ đích hoàn toàn có thể
   sửa mã JS đang chạy trong DevTools để bỏ qua bước đăng nhập, hoặc
   đọc thẳng dữ liệu trong `localStorage`.
   → **"Frontend-only admin authentication is NOT secure for production."**
3. Muốn triển khai thật, bắt buộc phải có backend riêng cho việc xác
   thực (xem mục "Hướng dẫn chuyển sang backend" trong `README.md`).
4. Nếu bạn xoá `localStorage` của trình duyệt (hoặc dùng trình duyệt/
   máy khác), tài khoản `admin` mặc định này sẽ được **tạo lại** với
   mật khẩu gốc `Admin@123456` — vì đây là dữ liệu cục bộ theo từng
   trình duyệt, không phải một tài khoản tập trung.

## Vai trò (Role) có sẵn

| Role | Mô tả |
|---|---|
| `SUPER_ADMIN` | Toàn quyền, kể cả quản lý tài khoản Admin khác. |
| `ADMIN` | Quản lý toàn bộ dữ liệu game (không quản lý được tài khoản Admin khác). |
| `EDITOR` | Chỉ chỉnh Tướng / Quân địch / Boss / Màn chơi / Wave. |
| `MODERATOR` | Chỉ xem/thao tác Người chơi và Nhật ký Admin. |

Tài khoản `admin` mặc định có role `SUPER_ADMIN`.
