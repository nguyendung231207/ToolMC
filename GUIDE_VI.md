# 🎮 ToolMC v1 - Hướng Dẫn Sử Dụng

Chào mừng bạn đến với **ToolMC**, công cụ bot Minecraft mã nguồn mở, nhẹ, hiệu suất cao với giao diện hiện đại và dễ sử dụng.

---

## 🌟 Giới Thiệu & Tính Năng Nổi Bật

ToolMC được thiết kế để tối ưu hóa trải nghiệm botting của bạn:
*   **Siêu nhẹ & Mượt mà:** Giao diện được tối ưu hóa, không ngốn tài nguyên (RAM/CPU) như các tool khác.
*   **Giao diện Hiện đại (Modern UI):** Thiết kế lấy cảm hứng từ Shadcn, hỗ trợ Dark Mode, dễ nhìn và dễ thao tác.
*   **Dễ sử dụng:** Các chức năng được bố trí trực quan, phù hợp cho cả người mới bắt đầu.
*   **Đa năng:** Hỗ trợ từ phiên bản 1.8 đến 1.21.
*   **Tính năng mạnh mẽ:** Auto-reconnect, Anti-AFK, Kill Aura, Quản lý kho đồ, Chat Spam, và Scripting Engine linh hoạt.

---

## 📖 Hướng Dẫn Sử Dụng

### 1. Cách Sử Dụng Cơ Bản

1.  **Lấy Key & Đăng nhập:**
    *   Mở tool, bạn sẽ thấy màn hình xác thực.
    *   Nhấn nút **"Get Key"** để lấy link nhận khóa miễn phí (Key có hiệu lực 24h).
    *   Hoàn thành mã Captcha/Quảng cáo để nhận Key.
    *   Dán Key vào ô trống và nhấn **"Login"**.

2.  **Thêm Bot & Kết nối:**
    *   Tại màn hình chính (General Settings->Server Manager), nhấn **"Add New Server"** (Thêm Server).
    *   Nhập **Accounts list** (Danh sách tài khoản) với định dạng: `username:password` `username|password` hoặc (mỗi tài khoản 1 dòng).
    *   Chọn **Version** (Phiên bản Minecraft của server).
    *   Nhấn **"Start"** để bot vào server.

3.  **Điều khiển Bot:**
    *   Sau khi bot vào server, bạn có thể chat, di chuyển, hoặc sử dụng các nút chức năng nhanh như "Jump", "Drop", "Respawn".

### 2. Sử Dụng Proxy & Nhiều Tài Khoản

Để chạy nhiều bot cùng lúc mà không bị chặn IP, bạn cần dùng Proxy.

1.  **Quản lý Proxy:**
    *   Chuyển sang tab **"Proxy Manager"**.
    *   Nhập **"Proxy List"** để thêm danh sách proxy (SOCKS4, SOCKS5, HTTP).
    *   Định dạng: `IP:Port` hoặc `IP:Port:User:Pass`.
    *   Sửa **"Proxy Distribution"** để tùy chọn số lượng bot cho mỗi proxy.

2.  **Chạy Nhiều Bot:**
    *   Chỉ cần thêm nhiều tài khoản vào **"Accounts list"** và nhấn **"Start"**.

### 3. Hướng Dẫn Botting & Tạo Script

ToolMC hỗ trợ hệ thống Script mạnh mẽ để tự động hóa các hành động (Auto Login, Auto Farm, v.v.).

*   **Auto Commands:** Chạy ngay khi bot vào server (Ví dụ: lệnh đăng nhập, hoặc khi reconnect nó cũng sẽ tự chạy lệnh đó).
*   **Scripting Tab:** Chạy các kịch bản phức tạp theo chuỗi hành động.

#### Các Biến Hỗ Trợ (Variables)
Bạn có thể sử dụng các biến sau trong lệnh, tool sẽ tự động thay thế chúng:
*   `{player}`: Tên người dùng của bot.
*   `{random}`: Một chuỗi ngẫu nhiên (hữu ích để tránh bộ lọc spam).
*   `{password}`: Mật khẩu của bot (như đã xác định trong Danh sách tài khoản).

#### Danh Sách Lệnh Chi Tiết

**1. Chat & Lệnh Server**
Gửi tin nhắn hoặc lệnh đến server.
*   Cú pháp: `chat <tin nhắn>`
*   Ví dụ:
    ```text
    chat Xin chào server, mình là {player}!
    chat /login {password}
    ```

**2. Delay (Chờ)**
Chờ một khoảng thời gian (tính bằng mili-giây) trước khi thực hiện lệnh tiếp theo.
*   Cú pháp: `delay <ms>` (1000ms = 1 giây)
*   Ví dụ:
    ```text
    chat /register {password} {password}
    delay 2000
    chat /login {password}
    ```

**3. Di Chuyển (Movement)**
Điều khiển di chuyển của bot.
*   `startmove <forward|back|left|right|jump|sneak|sprint>`: Bắt đầu di chuyển (tiến/lùi/trái/phải/nhảy/ngồi/chạy).
*   `stopmove <forward|back|left|right|jump|sneak|sprint>`: Dừng di chuyển.
*   `resetmove`: Dừng tất cả mọi chuyển động.

**4. Kho Đồ & Tương Tác (Inventory)**
*   `sethotbar <slot 0-8>`: Chọn ô trên thanh công cụ (Hotbar).
*   `useheld`: Sử dụng/Tương tác với vật phẩm đang cầm trên tay (Chuột phải).
*   `winclick <slot> <0-chuột trái | 1-chuột phải>`: Click vào một ô cụ thể trong cửa sổ (Rương/Inventory/Menu).
*   `drop <slot>`: Vứt vật phẩm ở ô chỉ định.
*   `dropall`: Vứt toàn bộ đồ.
*   `closewindow`: Đóng cửa sổ hiện tại (Rương/Menu).

**5. Các Lệnh Khác**
*   `look <yaw>`: Nhìn theo hướng (góc quay).
*   `afkon` / `afkoff`: Bật/Tắt chế độ tự động Anti-AFK (Tự động di chuyển nhẹ để không bị kick).
*   `disconnect`: Ngắt kết nối.
*   `reconnect`: Kết nối lại.

#### 📝 Ví Dụ Script: Server KingMC.VN (Cập nhật 2/1/2026)

Dưới đây là script mẫu để bot tự động đăng nhập, vào khu vực AFK và treo máy:

**Kịch bản:** Đăng nhập -> Chọn vật phẩm menu -> Click menu -> Vào khu AFK -> Chat xác nhận.

Các bạn copy đoạn này vào phần **Script** hoặc **Auto Commands**:

```text
chat /dn {password}
delay 3000
sethotbar 4
delay 1000
useheld
delay 2000
winclick 24 1
delay 5000
chat /afk
```

**Giải thích:**
1.  `chat /dn {password}`: Nhập lệnh đăng nhập với mật khẩu bot.
2.  `delay 3000`: Chờ 3 giây để server xử lý.
3.  `sethotbar 4`: Chuyển tay cầm sang ô số 5 (Slot 4 - vì đếm từ 0).
4.  `useheld`: Click chuột phải (dùng vật phẩm menu).
5.  `delay 2000`: Chờ 2 giây để menu mở ra.
6.  `winclick 24 1`: Click chuột phải vào ô số 24 trong Menu (Vị trí warp AFK).
7.  `delay 5000`: Chờ 5 giây để dịch chuyển.
8.  `chat /afk`: Chat lệnh /afk để bắt đầu treo.

---
*Chúc các bạn treo bot vui vẻ!*
