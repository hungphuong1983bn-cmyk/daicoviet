# Đại Cồ Việt – Thủ Thành Hoa Lư

Game thủ thành (tower defense) chủ đề lịch sử Đại Cồ Việt. **Giai đoạn 2**
bổ sung: nhiều màn chơi, Tướng chỉ huy, Kỹ năng, Boss, Nhiệm vụ, và một khu
vực **Admin Dashboard** (`/admin`) quản lý toàn bộ dữ liệu/chức năng game.

> Phiên bản 1 (thư mục gốc `index.html`, `js/`, `css/`) vẫn chạy được và
> **không có chức năng nào bị xoá bỏ** — Giai đoạn 2 refactor có kiểm soát
> phần dữ liệu (từ hard-code sang DataService) và mở rộng thêm tính năng
> trên nền engine cũ (entities.js/game.js/ui.js).

---

## 1. Cách chạy game

Vì dự án chỉ dùng HTML/CSS/JS thuần (không build step), chỉ cần một static
file server (mở trực tiếp bằng `file://` có thể bị trình duyệt chặn
`localStorage`/`fetch` tuỳ trình duyệt, nên khuyến khích dùng server nhỏ):

```bash
cd daicoviet
python3 -m http.server 8080
# hoặc: npx serve .
```

Sau đó mở:

- Game: `http://localhost:8080/index.html`
- Admin: `http://localhost:8080/admin/login.html`

## 2. Cách vào Admin

1. Mở `/admin/login.html`.
2. Đăng nhập bằng tài khoản mặc định trong **`DEFAULT_ADMIN.md`**
   (`admin` / `Admin@123456`).
3. Sau khi đăng nhập sẽ được chuyển tới `/admin/index.html` (Dashboard).
4. **Đổi mật khẩu ngay** qua nút "Đổi mật khẩu" ở góc trên bên phải.

Chưa đăng nhập thì `/admin/index.html` sẽ tự động điều hướng về
`login.html` (`AuthService.requireLogin()` trong `shared/auth-service.js`).

### Tài khoản Admin & phân quyền (Phần 17)

Vào nút **"Quản lý tài khoản"** trên Admin Dashboard để tạo thêm tài khoản
Admin (chỉ `SUPER_ADMIN` mới tạo/xoá/đổi role được), khoá/mở khoá tài khoản,
xem lịch sử đăng nhập. 4 role: `SUPER_ADMIN`, `ADMIN`, `EDITOR`,
`MODERATOR` — chi tiết quyền theo từng mục xem `shared/auth-service.js`
(`PERMISSIONS`).

## 3. Cấu trúc thư mục

```
daicoviet/
├── index.html            # Trang chơi game (giữ ở gốc để không phá đường dẫn hiện có)
├── css/style.css
├── js/
│   ├── data.js            # Dựng GAME_DATA từ DataService (không còn hard-code số liệu)
│   ├── state.js            # GameState: tiến trình dài hạn + ván đang chơi dở
│   ├── entities.js         # Enemy / Tower / Projectile
│   ├── game.js             # Vòng lặp chính, hero/skill/boss/quest hook
│   ├── ui.js                # Điều hướng màn hình, HUD, thao tác canvas
│   └── main.js              # Bootstrap (async: chờ DataService.init())
├── shared/                 # Lớp dùng chung cho CẢ game lẫn admin
│   ├── storage-service.js   # Trừu tượng hoá localStorage (đổi sang API sau này chỉ sửa file này)
│   ├── crypto-util.js       # Băm mật khẩu (SHA-256 + salt, phía client)
│   ├── data-service.js      # "Database" trung tâm: seed mặc định + CRUD + buildGameData()
│   ├── auth-service.js      # Đăng nhập/đăng xuất/phiên/role Admin
│   ├── admin-service.js     # CRUD có kiểm tra quyền + ghi Nhật ký Admin
│   └── quest-service.js     # Đánh giá điều kiện & phát thưởng Nhiệm vụ
├── admin/
│   ├── login.html
│   ├── index.html
│   ├── css/admin.css
│   └── js/
│       ├── schemas.js        # Khai báo field cho form/table CRUD tự sinh
│       ├── components.js     # Toast / Confirm (kể cả xác nhận 2 bước) / Table / Form modal dùng chung
│       ├── app.js             # Toàn bộ 16 mục Admin (dashboard, players, CRUD, waves, backup...)
│       └── login.js
├── DEFAULT_ADMIN.md
└── README.md
```

**Khác với đề bài ở một điểm:** đề bài đề xuất đặt game trong `/game`.
Bản này giữ game ở thư mục gốc để không đổi đường dẫn `index.html` hiện có
(ưu tiên "không phá vỡ chức năng đang hoạt động" theo yêu cầu). `/admin` và
`/shared` vẫn tách biệt rõ ràng như đề bài yêu cầu.

## 4. Cấu trúc dữ liệu (Phần 16)

Tất cả nằm trong `localStorage`, namespace `dcv:*`, quản lý qua
`shared/data-service.js`. Mỗi collection là 1 key riêng:

| Collection | Mô tả |
|---|---|
| `gameConfig` | Cấu hình toàn cục (singleton, không phải mảng) |
| `players` | Hồ sơ người chơi (hiện chỉ có 1 hồ sơ cục bộ `local_player`, xem mục 7) |
| `heroes` | Tướng |
| `buildings` | Công trình (quân thủ thành) |
| `enemies` | Quân địch |
| `bosses` | Boss |
| `stages` | Màn chơi (bao gồm cả mảng `waves` lồng bên trong từng stage) |
| `skills` | Kỹ năng |
| `quests` | Nhiệm vụ |
| `items` | Vật phẩm |
| `rewards` | Cấu hình phần thưởng chung (thưởng qua đợt...) |
| `adminUsers` | Tài khoản Admin (mật khẩu đã băm, không có plaintext) |
| `adminLogs` | Nhật ký Admin |

`DataService.buildGameData()` gộp toàn bộ collection ở trên thành object
`GAME_DATA` mà engine game (entities.js/game.js/ui.js) sử dụng — đây là nơi
DUY NHẤT chuyển "dữ liệu Admin" thành "dữ liệu game", nên **mọi thay đổi từ
Admin đều có khả năng ảnh hưởng gameplay thật** (Phần 19), không phải giao
diện giả.

## 5. Kết nối Admin ↔ Game (Phần 19) — hoạt động thế nào

- Mỗi khi bắt đầu ván mới, tiếp tục ván đã lưu, hoặc mở bất kỳ trang Admin
  nào, `rebuildGameData()` được gọi lại để đọc dữ liệu **mới nhất** từ
  `localStorage`.
- Vì game và admin là 2 trang riêng biệt (2 tab trình duyệt), thay đổi của
  Admin có hiệu lực **từ lần tải trang / bắt đầu trận tiếp theo** của người
  chơi — đây là giới hạn hợp lý của kiến trúc "không server", không phải
  cập nhật real-time giữa 2 tab đang mở cùng lúc. Đã kiểm thử thực tế bằng
  kịch bản: Admin sửa Damage tướng 12 → 150, sửa REWARD_MULTIPLIER,
  đổi Damage tháp bậy rồi export/import khôi phục, v.v. — tất cả phản ánh
  đúng vào `GAME_DATA` sau khi rebuild (xem phần "Đã kiểm thử" bên dưới).

Ví dụ cụ thể đã kiểm chứng:
- Sửa `Đinh Bộ Lĩnh.damage` → tăng % sát thương mọi tháp trong trận
  tiếp theo dùng tướng này (`Game._heroBonuses`).
- Sửa `BOSS_MULTIPLIER` → HP/Damage boss được nhân lại mỗi khi
  `buildGameData()` chạy.
- Sửa Wave 5 gắn Boss khác (`{ boss: "boss_dai_la" }`) → game spawn đúng
  Boss đó ở cuối màn.
- Tắt (`enabled:false`) một loại quân địch/Boss đang được tham chiếu trong
  wave → game **bỏ qua an toàn** nhóm đó khi spawn thay vì crash
  (`Game.startNextWave`).

## 6. Các tính năng mới trong game (đồng bộ với Admin)

- **Tướng chỉ huy**: chọn trước khi vào trận (màn "Tướng"), cộng HP thành,
  % sát thương tháp, giảm sát thương thành nhận; mở khoá bằng vàng bền
  vững (khác vàng trong trận).
- **Kỹ năng chủ động**: gắn theo tướng, có nút riêng trong HUD, 3 loại hiệu
  ứng đã lập trình thật: `damage_all`, `heal_castle`, `buff_attack_speed`.
- **Nâng cấp tháp trong trận**: bấm vào tháp đã xây để nâng cấp (tăng
  damage/range theo `upgradeDamageMult`/`upgradeRangeMult`/`maxLevel`).
- **Boss**: xuất hiện ở wave cuối mỗi màn, có Defense/Resistance riêng.
- **Nhiệm vụ**: 5 loại điều kiện (`WAVE_CLEARED`, `STAGE_CLEARED`,
  `KILL_COUNT`, `CASTLE_HP_ABOVE_PERCENT`, `BOSS_KILLED`), thưởng vàng/EXP
  bền vững, có màn hình riêng để nhận thưởng.
- **3 màn chơi**: Hoa Lư → Phòng tuyến Đại La → Chiến trường Bạch Đằng, mở
  khoá tuần tự khi qua màn trước.
- **Cấu hình game** ảnh hưởng thật: `debugMode` (hiện vùng bắn tháp),
  `showDamageNumbers` (số sát thương bay lên), `showEnemyHpBar`,
  `showFps`, `autoSaveEnabled`, `tutorialEnabled` (gợi ý 1 lần khi vào
  trận lần đầu), `ENEMY_SPAWN_RATE`, `REWARD_MULTIPLIER`,
  `BOSS_MULTIPLIER`, `START_GOLD`, `START_HP`, `MAX_LEVEL`.

### Giới hạn được ghi nhận rõ ràng (không làm giả)

M��t số field trong đề bài được **lưu trữ và cho phép Admin chỉnh sửa**
nhưng **chưa được lập trình gắn vào gameplay** trong bản này, vì việc đó đòi
hỏi thêm cơ chế không có sẵn trong engine gốc (quân địch tấn công tháp,
mana/năng lượng, hero lên cấp qua kinh nghiệm trong trận...). Các field này
được đánh dấu bằng `hint` ngay trong form Admin (`admin/js/schemas.js`), ví
dụ: `expToUpgrade` của Tướng, `manaCost` của Kỹ năng, `skillCooldown` mô tả
của Boss. Đây là quyết định kiến trúc có chủ đích: **thà để trống rõ ràng
còn hơn giả vờ hoạt động.**

- **Đường đi (path) / vị trí thành / ô xây (buildSpots)** của Màn chơi là
  toạ độ pixel trên bản đồ. Admin CRUD được các thông số "thiết kế" (tên,
  độ khó, phần thưởng, điều kiện mở khoá, bật/tắt) nhưng **không có công cụ
  kéo-thả để vẽ lại bản đồ** — tạo màn mới qua Admin sẽ dùng một bản đồ
  mặc định đơn giản (đường chéo thẳng) để đảm bảo chơi được ngay thay vì bị
  vỡ; muốn bản đồ đẹp/phức tạp như Hoa Lư, cần chỉnh trực tiếp mảng `path`/
  `castle`/`buildSpots` trong dữ liệu (`shared/data-service.js` hoặc qua
  Export → sửa JSON → Import).
- **Tài khoản người chơi**: game hiện KHÔNG có hệ thống đăng nhập cho
  người chơi (khác với đăng nhập Admin). Toàn bộ trình duyệt = 1 hồ sơ chơi
  (`local_player`). Mục "Người chơi" trong Admin vì vậy luôn có đúng 1
  dòng cho tới khi có backend đa người dùng thật (xem mục 8). Cờ "Khoá tài
  khoản" (`banned`) VẪN có tác dụng thật: nếu bật, người chơi sẽ thấy màn
  hình "Tài khoản đã bị khoá" ngay khi mở game, không vào được menu.

## 7. Backup / Restore (Phần 14)

Vào Admin → **Backup / Restore**:

- **Export**: tải về 1 file `.json` chứa toàn bộ collection (trừ thông tin
  không cần thiết) — có thể mở bằng bất kỳ trình soạn thảo text nào để xem/
  sửa tay nếu muốn.
- **Import**: chọn lại file `.json` đã export, xác nhận rồi ghi đè toàn bộ
  dữ liệu hiện tại (trang tự tải lại sau khi import xong).
- **Reset**: đưa toàn bộ dữ liệu game về mặc định ban đầu, **giữ nguyên**
  tài khoản Admin hiện có. Có xác nhận 2 bước bắt buộc gõ đúng chữ "XOA"
  mới bấm được nút xác nhận cuối cùng (`Components.confirmDangerous`).

## 8. Giới hạn bảo mật frontend-only & hướng dẫn chuyển sang backend

> **Frontend-only admin authentication is NOT secure for production.**

Toàn bộ dữ liệu (kể cả tài khoản Admin đã băm mật khẩu) nằm trong
`localStorage` của trình duyệt người dùng. Điều này có nghĩa:

- Ai mở DevTools cũng đọc được toàn bộ dữ liệu game (không phải mật khẩu
  gốc vì đã băm SHA-256 + salt, nhưng đọc được cấu trúc/nội dung khác).
- Ai sửa được mã JS đang chạy (rất dễ qua DevTools) đều có thể bỏ qua bước
  kiểm tra đăng nhập, tự cấp quyền `SUPER_ADMIN` cho chính mình, hoặc chỉnh
  sửa trực tiếp dữ liệu game của bản thân (vàng, level...).
- Không có khái niệm "nhiều người chơi thật" dùng chung một server dữ
  liệu — mỗi trình duyệt là một vũ trụ dữ liệu độc lập.

Đây là giới hạn **cố hữu** của một ứng dụng 100% chạy phía client, không
phải lỗi thiết kế có thể vá bằng cách băm kỹ hơn hay giấu code kỹ hơn.

### Để chuyển sang backend thật (khuyến nghị lộ trình)

Kiến trúc đã được chia lớp sẵn để việc này **không cần viết lại game**:

1. **`shared/storage-service.js`** → thay các hàm `get/set/remove` bằng
   `fetch()` gọi REST API (hoặc dùng GraphQL/tRPC tuỳ chọn), giữ nguyên
   chữ ký hàm.
2. **`shared/data-service.js`** → thay việc đọc/ghi qua StorageService
   bằng gọi API tương ứng (`GET /api/heroes`, `POST /api/heroes`,...).
   `buildGameData()` có thể trở thành 1 endpoint tổng hợp phía server để
   giảm số lượt gọi.
3. **`shared/auth-service.js`** → thay kiểm tra mật khẩu phía client bằng
   gọi `POST /api/auth/login`; server kiểm tra bằng **bcrypt/Argon2**
   (không phải SHA-256 client-side), trả về **JWT hoặc session cookie**
   `httpOnly`. `getSession()` đọc token đó thay vì đọc `localStorage`.
4. **`shared/admin-service.js`** → giữ nguyên logic gọi hàm + ghi log,
   nhưng bản thân việc ghi log/kiểm tra quyền nên chuyển hẳn vào middleware
   phía server (không tin tưởng client kiểm tra quyền hộ server).
5. Thêm bảng `users` (người chơi thật, có đăng nhập) trong database, mỗi
   người chơi có `player_id` riêng thay vì `local_player` cố định — lúc đó
   mục "Người chơi" trong Admin sẽ liệt kê nhiều dòng thật.
6. Cân nhắc dùng ORM (Prisma/Drizzle) + PostgreSQL/MySQL cho các
   collection hiện tại (đã có sẵn schema rõ ràng, dễ ánh xạ 1-1 sang bảng).

## 9. Đã kiểm thử (Phần 22, mục 5)

Vì môi trường không có trình duyệt thật, việc kiểm thử được thực hiện bằng
kịch bản tự động hoá trên Node.js + jsdom, mô phỏng toàn bộ vòng đời trang
(tải HTML thật, chạy đúng các file `.js` thật theo đúng thứ tự `<script>`,
bắn sự kiện `DOMContentLoaded`, thao tác DOM/click như người dùng thật) —
không phải chỉ đọc code bằng mắt. Đã xác nhận:

- **Game**: tải `GAME_DATA` từ DataService, vào menu, chọn Tướng, bắt đầu
  màn Hoa Lư, xây tháp, nâng cấp tháp, dùng kỹ năng, chạy hết 5 wave (kể cả
  Boss ở wave cuối), thắng màn → mở khoá màn kế tiếp, nhiệm vụ được đánh
  dấu hoàn thành đúng lúc, vàng/EXP bền vững được cộng đúng công thức.
  Kịch bản thua (HP về 0) cũng được kiểm thử riêng: dừng đúng lúc, ghi
  nhận thống kê thắng/thua, xoá đúng save-game dở dang.
- **Admin (logic)**: seed tài khoản mặc định (mật khẩu đã băm, không phải
  plaintext), đăng nhập sai/đúng, phân quyền 4 role, CRUD có ghi Nhật ký
  Admin kèm before/after, cộng/trừ vàng - đổi level - reset người chơi,
  Export → sửa dữ liệu → Import khôi phục đúng bản cũ, Reset toàn bộ (giữ
  tài khoản Admin), đổi mật khẩu rồi đăng nhập lại bằng mật khẩu mới, tạo
  tài khoản phụ role EDITOR và xác nhận bị chặn thao tác ngoài quyền.
- **Admin (giao diện)**: dựng toàn bộ layout `admin/index.html` thật,
  render lần lượt cả 16 mục sidebar không phát sinh lỗi JavaScript, mở
  modal thêm mới (tạo thử 1 Kỹ năng), mở trình soạn Wave (đổi dropdown
  màn, kiểm tra card wave hiển thị đúng), mở modal "Quản lý tài khoản",
  và trang `login.html` nộp form đăng nhập thành công.
- Không phát sinh lỗi JavaScript ở console (`window.onerror`) trong toàn
  bộ các kịch bản trên.

## 10. Ghi chú khác

- Không có file âm thanh/nhạc nào trong dự án (`musicEnabled` là cờ dữ
  liệu dự phòng, chưa phát ra âm thanh thật vì không có asset).
- `MAX_LEVEL`, `expToUpgrade` của Tướng: dùng cho công thức lên cấp
  người chơi (`GameState.addPersistentReward`) và giới hạn cấp độ tối đa;
  lên cấp Tướng qua chiến đấu (thay vì chỉ Admin chỉnh tay) là hướng mở
  rộng tiếp theo.
