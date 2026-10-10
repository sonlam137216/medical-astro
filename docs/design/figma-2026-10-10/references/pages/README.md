# Ảnh tham chiếu từng trang (Figma, 10/10/2026)

Chụp từ file Figma mới bằng Chrome, cuộn từng đoạn từ trên xuống (đánh số 01, 02, …). Mỗi trang rộng ~1042px
trong Figma (không phải 1440). Ảnh JPEG chụp màn hình (scale 0,6–0,7, hiển thị khoảng 60% kích thước thật),
dùng để đối chiếu bố cục/nội dung, **không phải** nguồn để đo pixel. Đo số liệu bằng `../nodes.json` và Figma.
Các đoạn liền kề chồng lên nhau một phần, có chỗ hở nhỏ giữa hai ảnh liên tiếp.

| Thư mục          | Trang                                      | Số ảnh | Node mở đầu |
| ---------------- | ------------------------------------------ | ------ | ----------- |
| home             | Home                                       | 11     | 48:16       |
| about            | About Us                                   | 6      | 54:2        |
| doctors          | All Doctors                                | 4      | 62:51       |
| services         | Services                                   | 4      | 62:273      |
| service-template | General Service Template (Dental Implants) | 5      | 68:514      |
| packages-single  | Dental Packages (Single Treatments)        | 4      | 73:876      |
| packages-combos  | Dental Packages (Travel Combos)            | 5      | 73:1208     |
| travel-guide     | Dental Travel Guide                        | 3      | 108:201     |
| single-post      | Single Post                                | 3      | 178:143     |
| dental-knowledge | Dental Knowledge                           | 3      | 113:843     |

## Quan sát khi chụp (cần kiểm tra thêm trước khi sửa UI)

- Home dùng font sans đậm (giống Montserrat) cho tiêu đề; các trang còn lại dùng serif (giống Cormorant Garamond) cho tiêu đề. Chưa xác định tên font thật.
- Home có thanh trên cùng (điện thoại, email, Booking Now, Dental Knowledge), header 6 mục: Home, About us, Services, Dental Packages, Dental Travel Guide, Contact.
- Footer Home ghi "News"; footer các trang khác ghi "Contacts" (khác nhau giữa các trang).
- Nhiều section dùng dữ liệu mẫu lặp (5 thẻ Dental Implants giống nhau, chữ tiếng Việt "Chi phí thấp hơn…", "Chi nhánh:", "Chèn link facebook vào").
- Single Post: phần "Related articles" là ô xám giữ chỗ, ảnh người duyệt chuyên môn là hình tròn xám.
- Form tư vấn xuất hiện ở hầu hết các trang với ô mã quốc gia (+84).
- Lỗi chính tả trong Figma: "AUBOUT US", "SOCIA MEDIA", "What video", "consulation", "Aks on WhatsApp".
- Không thấy frame mobile/tablet, trạng thái hover/focus hay menu mở trong file.
