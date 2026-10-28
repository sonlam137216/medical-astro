# Tối ưu PageSpeed — 28/10/2026

Nguồn: báo cáo Home live lúc 21:00 (UTC+7), Mobile 83/100/92/92 và Desktop 99/93/92/92
(Performance / Accessibility / Best Practices / SEO).

## Thay đổi trong code

- Thanh liên hệ trên mobile dùng bố cục một cột cố định. Trước đây font tải xong làm nhóm nút rơi từ cột
  bên phải xuống hàng dưới, đẩy banner xuống 56px tại màn hình 412px.
- Preload duy nhất font Montserrat Latin dùng ở đầu trang; thêm font Arial dự phòng có cân chỉnh kích thước
  và chỉ số dọc cho Montserrat/Inter. Không đổi font thương hiệu sau khi tải xong.
- Inline CSS bằng cấu hình Astro chính thức. Home local không còn request stylesheet chặn hiển thị;
  CSS inline khoảng 13,4 KB gzip. Đổi lại, CSS được gửi cùng HTML mỗi trang thay vì dùng cache stylesheet
  chung giữa các trang. Cache font và ảnh vẫn giữ nguyên.
- Các ô lợi ích luôn có opacity 1 thay vì hiện dần theo vị trí cuộn: ô nằm trong màn hình đầu desktop
  không còn bị nhạt chữ giữa chừng. Hiệu ứng hover vẫn hoạt động, màu thiết kế được giữ nguyên.
- Link dịch vụ/gói dùng tên nội dung (`Explore …`); link báo dùng tên miền nguồn (`Read article on …`)
  và tên truy cập có thêm mô tả. Nhãn tùy chỉnh vẫn được giữ. Không xuất tên bài báo nội bộ từ admin.
- Nút bài báo cho phép xuống dòng kể cả hostname dài; icon mũi tên giữ kích thước.
- Link điện thoại/email có chiều cao tối thiểu 24px và khoảng cách trên desktop (40px trên mobile).
  Link footer trên mobile và link bác sĩ ở bài viết tăng lên 44px; nhãn người duyệt bài tăng lên 12px.
- Logo WebP được build ở quality 70. Không nén lại hoặc sửa file ảnh đã upload trong R2; ảnh banner CMS
  hiện có cần được thay/nén riêng nếu tiếp tục tối ưu dung lượng.
- CSP cho phép beacon Cloudflare Analytics từ `static.cloudflareinsights.com` và kết nối tới
  `cloudflareinsights.com`. Không tự chèn beacon hoặc đổi cài đặt dashboard.
- Thêm `npm run check:font-layout` vào CI: trì hoãn font 1,5 giây trên 5 cỡ màn hình, báo lỗi nếu tổng
  layout shift ở lần tải đầu vượt 0,1 hoặc font tải thất bại.

## Kết quả local

Đo bằng Chrome headless, dữ liệu đã Publish trong D1 local, font bị trì hoãn 1,5 giây. Đây là phép thử
hồi quy có kiểm soát, không phải điểm Lighthouse live hay Core Web Vitals của người dùng thực tế.

| Màn hình | CLS trước | CLS sau |
| -------- | --------: | ------: |
| 360px    |     0,016 |   0,000 |
| 390px    |     0,027 |   0,017 |
| 412px    |     0,237 |   0,009 |
| 1440px   |     0,008 |   0,006 |

- 295 unit/schema test qua; lint và kiểm tra Astro/TypeScript qua.
- Bản build local, kiểm link và SEO mặc định qua. Nội dung local khác dữ liệu live; các link pháp lý còn
  thiếu trong local không phải kết luận về trạng thái trang pháp lý live.
- CSP: 31 trang × 2 cỡ màn hình, không vi phạm.
- Responsive trước lượt tăng vùng bấm cuối: 31 trang × 5 cỡ, không tràn ngang; các phát hiện về link footer
  và khối người duyệt bài đã được xử lý sau đó và kiểm lại trên Home/bài viết.
- Bộ kiểm font mới qua ở 360, 390, 412, 768 và 1440px.
- Dữ liệu giả tạm thời có 3 bài báo (gồm hostname rất dài): kiểm ở 5 cỡ trên, không tràn/cắt chữ; tên truy cập
  khớp chữ nút. Beacon và endpoint Analytics được giả lập để kiểm CSP, không gửi telemetry thật.
- Database local/live không bị sửa trong kiểm tra dữ liệu giả. Bản build cuối đã được dựng lại từ dữ liệu
  local gốc, file cấu hình local được phục hồi.

## Đưa lên website thật

Không có migration hoặc biến môi trường mới. Commit/push code rồi Publish bằng target live `staging`.
Sau deploy, đo PageSpeed mới trên cả Mobile/Desktop để xác nhận CLS, lỗi beacon/CSP và link SEO; kết quả
live có thể khác phép thử local do nội dung, cache, vị trí mạng và điều kiện tải.
