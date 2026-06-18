================================================================================
                    GOALFLOW - HỆ THỐNG QUẢN LÝ MỤC TIÊU CÁ NHÂN
                          HƯỚNG DẪN SỬ DỤNG (User Guide)
================================================================================

Tên đồ án    : GoalFlow – Hệ thống quản lý mục tiêu cá nhân có tích hợp AI
Công nghệ    : Node.js, Express.js, MongoDB, Google Gemini AI
Sinh viên    : Vũ Đại Phong
Liên hệ     : phonggiang46260@gmail.com | 0769.637.928

================================================================================
MỤC LỤC
================================================================================
  1. Yêu cầu hệ thống
  2. Hướng dẫn cài đặt và chạy trên máy local
  3. Hướng dẫn sử dụng các chức năng
     3.1. Đăng ký tài khoản
     3.2. Đăng nhập
     3.3. Quên mật khẩu
     3.4. Đổi mật khẩu
     3.5. Tư vấn mục tiêu bằng AI
     3.6. Tạo mục tiêu tự động từ AI
     3.7. Thêm mục tiêu thủ công
     3.8. Quản lý mục tiêu (Xem / Sửa / Xóa / Lọc)
     3.9. Báo cáo kết quả & Xác thực AI
     3.10. Yêu cầu thay đổi lộ trình (Thương lượng AI Coach)
     3.11. Từ bỏ mục tiêu
     3.12. Hỗ trợ mục tiêu bằng AI
     3.13. Hồ sơ cá nhân & Thống kê
     3.14. Điểm Uy Tín (Trust Score)
     3.15. Xuất dữ liệu (Export Excel)
     3.16. Giao diện sáng / tối
     3.17. Thông báo nhắc nhở
     3.18. Quản lý phiên chat AI
     3.19. Xóa tài khoản
     3.20. Đăng xuất
  4. Lưu ý quan trọng
  5. Tài khoản demo (dành cho cô phản biện)

================================================================================
1. YÊU CẦU HỆ THỐNG
================================================================================

Để chạy ứng dụng GoalFlow trên máy local, cần chuẩn bị:

  - Node.js phiên bản >= 14.0.0  (khuyến nghị 18.x trở lên)
    Tải tại: https://nodejs.org/

  - MongoDB Community Server (cài đặt local)
    Tải tại: https://www.mongodb.com/try/download/community
    Hoặc sử dụng MongoDB Atlas (cloud): https://www.mongodb.com/atlas

  - Trình duyệt web hiện đại: Google Chrome, Firefox, hoặc Microsoft Edge

  - Kết nối internet (để sử dụng tính năng AI và gửi email)

================================================================================
2. HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY TRÊN MÁY LOCAL
================================================================================

Bước 1: Cài đặt dependencies
------------------------------
  Mở Terminal / Command Prompt tại thư mục gốc của dự án, chạy lệnh:

    npm install

  Lệnh này sẽ cài đặt toàn bộ thư viện cần thiết (Express, Mongoose, bcrypt,...).

Bước 2: Cấu hình biến môi trường
----------------------------------
  a) Sao chép file cấu hình mẫu:

       Copy file ".env.example" thành ".env"

  b) Mở file ".env" và điền các thông tin sau:

       PORT=3000
       GEMINI_API_KEY=<API Key Google Gemini, lấy tại https://aistudio.google.com/apikey>
       EMAIL_USER=<Địa chỉ Gmail dùng để gửi email thông báo>
       EMAIL_PASSWORD=<App Password của Gmail, xem hướng dẫn bên dưới>
       MONGODB_URI=mongodb://127.0.0.1:27017/goalflow
       JWT_SECRET=<Chuỗi bí mật bất kỳ, ví dụ: goalflow_secret_2024>

  * Hướng dẫn tạo App Password cho Gmail:
    - Truy cập https://myaccount.google.com/security
    - Bật "Xác minh 2 bước" (2-Step Verification)
    - Sau đó vào https://myaccount.google.com/apppasswords
    - Tạo App Password mới, copy mật khẩu 16 ký tự vào EMAIL_PASSWORD

Bước 3: Khởi động MongoDB
--------------------------
  - Nếu dùng MongoDB local: đảm bảo MongoDB đang chạy (mongod service)
  - Nếu dùng MongoDB Atlas: thay đổi MONGODB_URI trong file .env thành
    connection string của Atlas

Bước 4: Khởi động ứng dụng
----------------------------
  Cách 1 (Khuyến nghị): Chạy file start.bat (Windows)

    Nhấp đúp vào file "start.bat" trong thư mục gốc.

  Cách 2: Chạy bằng lệnh

    npm start

  Cách 3: Chạy chế độ phát triển (tự động restart khi sửa code)

    npm run dev

Bước 5: Truy cập ứng dụng
---------------------------
  Mở trình duyệt web và truy cập:

    http://localhost:3000

  Ứng dụng sẵn sàng sử dụng!

================================================================================
3. HƯỚNG DẪN SỬ DỤNG CÁC CHỨC NĂNG
================================================================================

3.1. ĐĂNG KÝ TÀI KHOẢN
------------------------
  - Tại màn hình chào mừng, nhấn tab "Đăng Ký"
  - Điền thông tin:
      + Tên của bạn (ví dụ: Nguyễn Văn A)
      + Email (bắt buộc phải là @gmail.com)
      + Mật khẩu (tối thiểu 6 ký tự)
  - Nhấn nút "Đăng ký tài khoản"
  - Hệ thống sẽ gửi email chào mừng đến hộp thư Gmail của bạn
  - Sau khi đăng ký thành công, chuyển sang tab "Đăng Nhập" để đăng nhập

3.2. ĐĂNG NHẬP
----------------
  - Tại màn hình chào mừng, chọn tab "Đăng Nhập" (mặc định)
  - Nhập Email và Mật khẩu đã đăng ký
  - Nhấn nút "Đăng nhập hệ thống"
  - Sau khi đăng nhập thành công, hệ thống chuyển đến màn hình lựa chọn:
      + "Đã có mục tiêu" → chuyển đến màn hình quản lý mục tiêu
      + "Chưa có mục tiêu" → chuyển đến màn hình tư vấn AI

  * Lưu ý: Phiên đăng nhập sẽ tự động hết hạn sau 30 phút không tương tác.
    Sau khi hết phiên, hệ thống sẽ yêu cầu đăng nhập lại.

3.3. QUÊN MẬT KHẨU
--------------------
  - Tại màn hình đăng nhập, nhấn liên kết "Quên mật khẩu?"
  - Nhập email đã đăng ký → nhấn "Gửi mật khẩu mới"
  - Hệ thống sẽ tạo mật khẩu ngẫu nhiên mới và gửi vào email của bạn
  - Sử dụng mật khẩu mới để đăng nhập

3.4. ĐỔI MẬT KHẨU
--------------------
  - Mở menu điều hướng (nhấn biểu tượng ☰ ở góc trên bên trái)
  - Chọn "Đổi mật khẩu"
  - Hoặc vào Hồ sơ cá nhân → nhấn nút "Đổi mật khẩu"
  - Nhập: Mật khẩu cũ, Mật khẩu mới, Xác nhận mật khẩu mới
  - Nhấn "Lưu thay đổi"
  - Hệ thống sẽ hỏi bạn có muốn đăng nhập lại bằng mật khẩu mới không

3.5. TƯ VẤN MỤC TIÊU BẰNG AI
-------------------------------
  - Từ màn hình lựa chọn, nhấn "Chưa có mục tiêu"
  - Hoặc từ menu điều hướng, chọn "Tư vấn AI"
  - Trò chuyện với AI bằng tiếng Việt:
      + Chia sẻ mong muốn, ước mơ, lĩnh vực quan tâm
      + AI sẽ đặt câu hỏi để hiểu rõ hơn về bạn
      + Ví dụ: "Tôi muốn học lập trình web trong 3 tháng"
  - Sau khi trao đổi đủ thông tin, nút "Tạo mục tiêu từ cuộc trò chuyện"
    sẽ xuất hiện

3.6. TẠO MỤC TIÊU TỰ ĐỘNG TỪ AI
-----------------------------------
  - Sau khi trò chuyện với AI, chọn khoảng thời gian mong muốn
    (Tuần / Tháng / Năm) và nhập số lượng
  - Nhấn nút "Tạo mục tiêu từ cuộc trò chuyện"
  - AI sẽ phân tích toàn bộ cuộc hội thoại và tự động tạo danh sách
    mục tiêu SMART cho bạn, bao gồm:
      + Tiêu đề mục tiêu
      + Mô tả chi tiết
      + Hạn hoàn thành
      + Mức độ ưu tiên (Cao / Trung bình / Thấp)
      + Nhãn phân loại
  - Số lượng mục tiêu AI tạo phụ thuộc vào Điểm Uy Tín (Trust Score)
    của bạn (xem mục 3.14)

3.7. THÊM MỤC TIÊU THỦ CÔNG
------------------------------
  - Từ màn hình quản lý mục tiêu, nhấn nút "Thêm mục tiêu"
  - Điền thông tin:
      + Tiêu đề mục tiêu (bắt buộc)
      + Mô tả chi tiết (tùy chọn)
      + Loại mục tiêu: Tuần / Tháng / Năm / Dài hạn
      + Hạn hoàn thành (bắt buộc)
      + Độ ưu tiên: Cao / Trung bình / Thấp
      + Thẻ nhãn (tùy chọn, cách nhau bằng dấu phẩy)
  - Nhấn "Thêm mục tiêu" để lưu

3.8. QUẢN LÝ MỤC TIÊU (XEM / SỬA / XÓA / LỌC)
--------------------------------------------------
  a) Xem danh sách mục tiêu:
     - Mỗi mục tiêu hiển thị: tiêu đề, mô tả, trạng thái, mức ưu tiên,
       hạn hoàn thành, và thanh tiến độ

  b) Lọc theo thời gian:
     - Sử dụng các tab: Tất cả / Tuần / Tháng / Năm / Dài hạn
     - Nhấn vào tab tương ứng để lọc danh sách

  c) Sửa mục tiêu:
     - Nhấn vào biểu tượng chỉnh sửa (bút) trên thẻ mục tiêu
     - Hệ thống sẽ yêu cầu bạn giải thích lý do muốn thay đổi
       (tính năng Thương lượng AI Coach, xem mục 3.10)

  d) Xóa mục tiêu:
     - Nhấn vào biểu tượng xóa (thùng rác) trên thẻ mục tiêu
     - Xác nhận xóa

3.9. BÁO CÁO KẾT QUẢ & XÁC THỰC AI
--------------------------------------
  Khi bạn đã hoàn thành một mục tiêu:

  - Nhấn nút "Báo cáo kết quả" trên thẻ mục tiêu
  - Điền báo cáo:
      + Nội dung đã hoàn thành (bắt buộc): Mô tả cụ thể kết quả đạt được,
        thời gian thực hiện, số liệu thực tế...
      + Link minh chứng (tùy chọn): GitHub, Google Drive, ảnh chụp màn hình...
  - Nhấn "Gửi cho AI thẩm định"
  - AI sẽ đánh giá báo cáo của bạn với các tiêu chí nghiêm ngặt:
      + Báo cáo quá ngắn hoặc chung chung → TỪ CHỐI
      + Báo cáo không liên quan đến mục tiêu → TỪ CHỐI
      + Báo cáo có dữ liệu cụ thể, đo lường được → DUYỆT
  - Kết quả hiển thị: Phê duyệt/Từ chối, Điểm tin cậy (0-100%), Nhận xét AI
  - Nếu AI duyệt:
      + Mục tiêu chuyển sang trạng thái "Đã hoàn thành"
      + Tăng Điểm Uy Tín (Trust Score)
      + Gửi email chúc mừng đến hộp thư của bạn
  - Nếu AI từ chối: Bạn có thể gửi lại báo cáo chi tiết hơn

3.10. YÊU CẦU THAY ĐỔI LỘ TRÌNH (THƯƠNG LƯỢNG AI COACH)
------------------------------------------------------------
  Khi muốn chỉnh sửa mục tiêu đang thực hiện:

  - Nhấn biểu tượng chỉnh sửa trên thẻ mục tiêu
  - Hệ thống mở hộp thoại "Yêu cầu thay đổi lộ trình"
  - Nhập lý do muốn thay đổi (tối thiểu 10 ký tự)
  - Nhấn "Gửi cho AI Coach xét duyệt"
  - AI Coach sẽ đánh giá lý do:
      + CHẤP NHẬN: Hoàn cảnh bất khả kháng, sự kiện đột xuất, vấn đề sức khỏe
        → Cho phép chỉnh sửa mục tiêu
      + TỪ CHỐI: Lý do mơ hồ ("khó quá", "lười", "mệt")
        → Đưa ra lời khuyên động lực
  - Nếu được chấp nhận, nhấn "Tiến hành sửa mục tiêu" để chỉnh sửa
  - Nếu bị từ chối, bạn có thể "Giải thích lại" với lý do rõ ràng hơn

3.11. TỪ BỎ MỤC TIÊU
-----------------------
  - Nhấn biểu tượng "Từ bỏ" (cờ trắng) trên thẻ mục tiêu
  - Hệ thống hiển thị cảnh báo hậu quả:
      + Mục tiêu bị đánh dấu "thất bại" vĩnh viễn
      + Trừ 10 điểm Uy Tín (Trust Score)
      + Không thể hoàn tác
  - Nhập lý do từ bỏ (tùy chọn)
  - Nhấn "Xác nhận từ bỏ" hoặc "Tiếp tục cố gắng" để quay lại

3.12. HỖ TRỢ MỤC TIÊU BẰNG AI
---------------------------------
  - Từ màn hình quản lý mục tiêu, nhấn nút "Hỗ trợ bằng AI"
  - Chọn một mục tiêu cần AI hỗ trợ
  - AI sẽ đưa ra lời khuyên, gợi ý cách thực hiện mục tiêu hiệu quả hơn

3.13. HỒ SƠ CÁ NHÂN & THỐNG KÊ
---------------------------------
  - Mở menu điều hướng → chọn "Hồ sơ cá nhân"
  - Trang hồ sơ hiển thị:
      + Ảnh đại diện (có thể thay đổi bằng cách nhấn vào ảnh)
      + Tên và email người dùng
      + Thống kê nhanh: Tổng mục tiêu / Đã hoàn thành / Đang thực hiện
      + Điểm Uy Tín (Trust Score)
      + Biểu đồ tròn: Phân bố mức độ ưu tiên
      + Biểu đồ cột: Tiến độ hoàn thành 12 tháng qua

3.14. ĐIỂM UY TÍN (TRUST SCORE)
---------------------------------
  Trust Score là hệ thống đánh giá uy tín của người dùng:

  - Khởi đầu: 100 điểm
  - Tăng điểm khi hoàn thành mục tiêu (AI xác thực):
      + Mục tiêu ưu tiên Cao: +4 điểm
      + Mục tiêu ưu tiên Trung bình: +3 điểm
      + Mục tiêu ưu tiên Thấp: +2 điểm
      + Bonus thêm +2 nếu có link minh chứng và AI đánh giá cao (>= 80%)
  - Giảm điểm khi từ bỏ mục tiêu: -10 điểm / lần
  - Điểm tối đa: 200, tối thiểu: 0

  Trust Score ảnh hưởng đến số lượng mục tiêu AI tạo:
      + 100+ điểm → AI tạo 5-13 mục tiêu
      + 50-99 điểm → AI tạo 4-10 mục tiêu
      + 1-49 điểm → AI tạo 1-4 mục tiêu
      + 0 điểm → AI tạo 1-2 mục tiêu

3.15. XUẤT DỮ LIỆU (EXPORT EXCEL)
------------------------------------
  - Vào Hồ sơ cá nhân
  - Nhấn nút "Xuất dữ liệu"
  - File Excel (.xlsx) sẽ được tải về, chứa toàn bộ danh sách mục tiêu
    với các cột: Tiêu đề, Mô tả, Trạng thái, Ưu tiên, Hạn chót, Loại, Nhãn

3.16. GIAO DIỆN SÁNG / TỐI (DARK MODE)
----------------------------------------
  - Mở menu điều hướng (nhấn biểu tượng ☰)
  - Trong mục "GIAO DIỆN", bật/tắt công tắc "Chế độ tối"
  - Giao diện sẽ chuyển đổi ngay lập tức
  - Tùy chọn được lưu lại cho lần truy cập sau

3.17. THÔNG BÁO NHẮC NHỞ
--------------------------
  Hệ thống tự động nhắc nhở:
  - Hàng ngày: Nhắc thực hiện mục tiêu ngắn hạn (< 6 tháng)
  - Hàng tháng: Nhắc rà soát mục tiêu dài hạn (>= 6 tháng)
  - Thông báo hiển thị dưới dạng toast trong ứng dụng
    và notification trên trình duyệt (nếu được cấp quyền)

3.18. QUẢN LÝ PHIÊN CHAT AI
-----------------------------
  - Trong màn hình tư vấn AI, nhấn biểu tượng menu (☰) bên trái
  - Sidebar hiển thị danh sách các cuộc trò chuyện trước đó
  - Nhấn vào một phiên để xem lại lịch sử trò chuyện
  - Nhấn "Cuộc trò chuyện mới" để bắt đầu phiên chat mới
  - Có thể xóa phiên chat cũ

3.19. XÓA TÀI KHOẢN
---------------------
  - Vào Hồ sơ cá nhân
  - Nhấn nút "Xóa tài khoản" (màu đỏ)
  - Xác nhận xóa
  - Toàn bộ dữ liệu sẽ bị xóa vĩnh viễn: tài khoản, mục tiêu,
    lịch sử chat AI
  - Hành động này KHÔNG THỂ hoàn tác

3.20. ĐĂNG XUẤT
-----------------
  - Mở menu điều hướng → nhấn "Đăng xuất"
  - Hoặc đợi phiên đăng nhập hết hạn sau 30 phút không tương tác

================================================================================
4. LƯU Ý QUAN TRỌNG
================================================================================

  a) Yêu cầu email:
     - Hệ thống chỉ chấp nhận email có đuôi @gmail.com

  b) Bảo mật:
     - Mật khẩu được mã hóa bằng bcrypt trước khi lưu vào database
     - Xác thực người dùng bằng JWT Token (có hạn 7 ngày)
     - Phiên làm việc tự động hết hạn sau 30 phút không hoạt động
     - Hệ thống có Rate Limiting chống spam (100 req/15 phút cho API AI,
       20 req/15 phút cho đăng nhập)

  c) AI Gemini:
     - Tính năng AI sử dụng Google Gemini API
     - Hệ thống có cơ chế fallback tự động qua nhiều phiên bản model
       nếu một model hết quota
     - Cần có kết nối internet để sử dụng tính năng AI

  d) Email thông báo:
     - Email chào mừng khi đăng ký
     - Email chúc mừng khi hoàn thành mục tiêu
     - Email khôi phục mật khẩu
     - Cần cấu hình đúng EMAIL_USER và EMAIL_PASSWORD trong file .env

  e) Dữ liệu:
     - Toàn bộ dữ liệu được lưu trữ trên MongoDB
     - Dữ liệu cũng được cache tại localStorage trên trình duyệt
       để tăng tốc độ tải

================================================================================
5. TÀI KHOẢN DEMO (DÀNH CHO CÔ PHẢN BIỆN)
================================================================================

  Cô có thể tự tạo tài khoản mới bằng email @gmail.com của cô,
  hoặc sử dụng tài khoản demo sau:

    Email    : Admin@gmail.com
    Mật khẩu : 123456

  * Lưu ý: Nếu cô gặp khó khăn trong quá trình cài đặt hoặc sử dụng,
    vui lòng liên hệ sinh viên qua:
      - Email: phonggiang46260@gmail.com
      - Điện thoại: 0769.637.928

================================================================================
                         Cảm ơn cô đã dành thời gian đánh giá!
================================================================================
