# Plan: email thông báo yêu cầu tư vấn cho admin

Ngày lập: **26/10/2026**.

**Trạng thái 28/10/2026: đã triển khai code theo yêu cầu chủ dự án.** Chủ dự án xác nhận domain đã Verified, đã tạo API key và cung cấp From `no-reply@melatecdentalclinic.com`. Hướng dẫn cấu hình/nghiệm thu: [EMAIL_NOTIFICATIONS.md](./EMAIL_NOTIFICATIONS.md). Chưa gửi thật hoặc deploy remote; origin production đã đặt `https://melatecdentalclinic.com`; chủ dự án báo đã thêm `RESEND_API_KEY` trên Worker; còn đối chiếu D1 production, migrate remote và cấu hình staging.

## 1. Mục tiêu và phạm vi

- Gửi email thông báo cho admin sau khi khách gửi form tư vấn hợp lệ và yêu cầu đã được lưu vào D1.
- Cho phép admin bật/tắt thông báo và thay đổi một địa chỉ nhận trong CMS.
- Email thông báo tối giản: mã yêu cầu, thời gian, link vào trang chi tiết trong admin. Thông tin liên hệ và dịch vụ khách quan tâm được xem sau đăng nhập.
- Email gặp lỗi không làm mất yêu cầu tư vấn hoặc khiến khách phải gửi lại.
- Giai đoạn đầu không gửi email xác nhận cho khách, không gửi marketing, không hỗ trợ nhiều người nhận hay đính kèm hồ sơ.

## 2. Hiện trạng khi lập plan

- Website đang dùng địa chỉ Cloudflare Workers, chưa có domain thật.
- Các form dùng chung `POST /api/consultation`, lưu vào `consultation_requests` trong D1.
- API đã kiểm tra Origin, validate server-side, giới hạn body 8 KB, honeypot và chống lưu trùng bằng `submission_id`.
- `CONSULTATION_LIMITER` được cấu hình 5 lần/phút/IP; việc kiểm tra phụ thuộc binding và IP header. Đây là giới hạn gần đúng theo từng Cloudflare location, không phải quota email toàn hệ thống.
- Turnstile hiện là tùy chọn; cần kiểm tra cấu hình thực tế trước khi bật thông báo.
- Admin hiện theo dõi yêu cầu mới trong `/admin`; chưa có chức năng gửi email hoặc hàng đợi email.
- Quyết định cũ “không gửi email” trong `CLAUDE.md` mô tả hiện trạng. Khi được yêu cầu triển khai plan này, cập nhật tài liệu liên quan cho nhất quán.

## 3. Phương án dự kiến

**Resend gửi email qua API; Cloudflare Workers xử lý backend; D1 lưu cài đặt và công việc gửi.**

- Domain gửi được xác minh một lần trên Resend, ưu tiên tên miền phụ dành riêng cho thông báo.
- Địa chỉ gửi cố định do hệ thống cấu hình; địa chỉ nhận do admin quản lý trong CMS.
- API key đặt trong Workers Secret, giới hạn quyền gửi và domain; tách key staging/production.
- Tên miền website và tên miền gửi email có thể cấu hình riêng. Website có thể tiếp tục chạy trên `workers.dev` trong lúc xác minh domain gửi.
- Chưa có domain vẫn có thể thử bằng `onboarding@resend.dev`, nhưng chỉ gửi đến email gắn với tài khoản Resend. **Theo yêu cầu hiện tại, không triển khai chế độ thử này; đợi có domain thật.**

## 4. Điều kiện bắt đầu

- [x] Chủ dự án xác nhận domain đã Verified trên Resend.
- [x] Chủ dự án yêu cầu tiếp tục triển khai chức năng email (28/10/2026).
- [ ] Có tài khoản Resend thuộc quyền quản lý của phòng khám, bật xác thực hai bước.
- [ ] Chốt địa chỉ gửi, tên người gửi, email admin nhận thông báo và URL dùng cho link vào admin.
- [ ] Kiểm tra gói dịch vụ, quota và giá Resend tại thời điểm triển khai; tính cả email xác minh, email thử và retry.

## 5. Setup tài khoản và hạ tầng

1. Trong Resend, thêm domain gửi, ví dụ `notify.example.com` (chỉ là ví dụ, không phải domain thực tế của dự án).
2. Kiểm tra DNS/email hiện tại, sau đó thêm chính xác các bản ghi Resend cung cấp trong dashboard. Không tự đoán giá trị bản ghi; không thay MX đang phục vụ hộp thư công ty. Kiểm tra SPF, DKIM và chính sách DMARC phù hợp với cấu hình hiện có.
3. Chờ domain đạt trạng thái Verified; chỉ cần cấu hình gửi cho phạm vi này.
4. Tạo API key với quyền Sending access, giới hạn vào domain gửi. Tạo key riêng cho từng môi trường.
5. Lưu `RESEND_API_KEY` bằng Workers Secret. Cấu hình địa chỉ gửi cố định và URL website theo môi trường; tên biến cụ thể sẽ được chốt khi implement. Không gửi key qua chat hoặc commit vào Git.
6. Cấu hình đầy đủ Turnstile: secret ở runtime, site key ở build và hostname hợp lệ. Kiểm tra lại form sau khi bật.
7. Thiết lập tác vụ nền xử lý công việc gửi và retry. Phương án ưu tiên là outbox trong D1 cùng Worker chạy theo lịch; kiểm tra cách tích hợp scheduled handler với entrypoint Astro hiện tại trước khi triển khai.

## 6. Phần cần xây trong website

### Cài đặt trong admin

- Một mục “Thông báo email”: bật/tắt, email nhận đang hoạt động, email mới đang chờ xác minh, nút gửi thử và trạng thái gửi gần nhất.
- Cài đặt lưu trong D1, không đưa vào snapshot nội dung public hay bundle trình duyệt.
- Khi đổi email, gửi link xác nhận tới địa chỉ mới. Chỉ kích hoạt khi xác nhận thành công; giữ địa chỉ cũ hoạt động trong thời gian chờ.
- Nếu chưa có địa chỉ hoạt động thì chưa bật thông báo. Gửi thử chỉ đến địa chỉ đã xác minh đang hoạt động.
- Xác nhận địa chỉ nhận là chức năng do website xây thêm, không phải bước bắt buộc xác minh từng người nhận của Resend.
- Token xác nhận có hạn dùng, dùng một lần, lưu dạng băm; không ghi token vào log. Dùng bước xác nhận rõ ràng bằng POST để công cụ quét link trong email không tự kích hoạt thay đổi.
- Bảo vệ thao tác bằng xác thực admin, kiểm tra chống CSRF và rate limit riêng cho gửi thử/gửi lại xác nhận.

### Luồng tiếp nhận và gửi

1. Kiểm tra form và chống spam như hiện tại.
2. Trong cùng giao dịch D1, lưu yêu cầu mới và tạo một công việc thông báo nếu tính năng đang bật và đã có người nhận hợp lệ.
3. Chỉ tạo công việc khi có yêu cầu mới. Request trùng `submission_id` trả thành công như hiện tại, không tạo thêm email.
4. Trả thành công cho khách sau khi lưu thành công; không chờ Resend gửi xong.
5. Tác vụ nền lấy công việc chờ, kiểm tra tính năng còn bật và dùng địa chỉ nhận đang hoạt động tại thời điểm gửi. Kiểm soát nhiều lượt xử lý đồng thời, dùng khóa chống gửi trùng phía ứng dụng và idempotency của nhà cung cấp khi phù hợp.
6. Lưu trạng thái, số lần thử, thời điểm thử tiếp và mã email của nhà cung cấp. Retry có giãn cách, có giới hạn; phân biệt lỗi tạm thời/quota với lỗi cấu hình hoặc địa chỉ không hợp lệ.
7. Khi tắt thông báo, ngừng gửi cả công việc đang chờ. Khi bật lại, xử lý tiếp công việc còn hiệu lực; không tự tạo email cho toàn bộ yêu cầu lịch sử. Đặt hạn xử lý công việc để tránh gửi dồn thông báo quá cũ.

Không cam kết gửi đúng một lần tuyệt đối khi nhà cung cấp đã nhận email nhưng phản hồi bị mất. Cần hạn chế gửi trùng và hiển thị rõ tình trạng không chắc chắn khi cần xử lý thủ công.

### Bảo mật và vận hành

- Không nhận `to`, `cc`, `bcc`, `from` hoặc URL quản trị từ dữ liệu form public.
- Dùng mẫu cố định, escape dữ liệu khi tạo email; link admin từ URL môi trường tin cậy và vẫn yêu cầu đăng nhập.
- Thêm giới hạn tổng số email theo giờ/ngày bằng bộ đếm nhất quán; không dùng riêng rate limit IP hiện tại để quản lý quota. Khi hết ngân sách gửi, giữ yêu cầu trong D1 và hoãn thông báo.
- Không ghi thông tin khách, API key hoặc token xác nhận vào log, audit log hay lỗi trả về client.
- Staging chỉ gửi đến hộp thư thử nghiệm được cấu hình; không dùng địa chỉ nhận production.
- Tắt theo dõi mở/click cho thông báo này; rà soát thời gian lưu nội dung/log ở nhà cung cấp và cập nhật thông tin quyền riêng tư nếu cần.
- Trạng thái “nhà cung cấp đã nhận gửi” không đồng nghĩa “đã giao” hoặc “admin đã đọc”. Nếu cần theo dõi phát thư/bounce trong CMS, thêm webhook xác minh chữ ký và chống xử lý lặp; không gắn nhãn “đã giao” chỉ dựa trên phản hồi API gửi.

## 7. Thứ tự triển khai và nghiệm thu

- [x] Rà soát code/cấu hình mới nhất trước khi bắt đầu; plan này có thể cần điều chỉnh theo thay đổi của dự án hoặc nhà cung cấp.
- [x] Thêm migration cho cài đặt, xác minh người nhận và outbox; cập nhật lớp DB/schema, bảo đảm dữ liệu cá nhân không vào audit hoặc snapshot public.
- [x] Xây trang admin, luồng xác nhận email và gửi thử.
- [x] Tích hợp lưu yêu cầu + tạo công việc nguyên tử; thêm sender nền, retry, chống gửi trùng và giới hạn gửi.
- [x] Kiểm tra: form hợp lệ/không hợp lệ, honeypot, Turnstile, gửi trùng, lỗi giao dịch D1, timeout/429/5xx từ Resend, key/domain sai, xác nhận hết hạn/dùng lại, đổi email khi có việc chờ, bật/tắt và giới hạn gửi thử.
- [ ] Chạy các kiểm tra phù hợp của repo và thử luồng thật trên staging; xác nhận lỗi email không làm mất yêu cầu.
- [ ] Áp migration, cấu hình secrets/tác vụ nền và deploy production theo quy trình dự án. Giữ tính năng tắt cho đến khi người nhận xác minh và gửi thử thành công.
- [x] Cập nhật `README.md`, `CLAUDE.md` và tài liệu bàn giao; hướng dẫn admin thay email và xem lỗi.

## 8. Nguồn tham khảo

Đã đối chiếu ngày lập plan; kiểm tra lại tại thời điểm triển khai.

- [Resend: thêm và xác minh domain](https://resend.com/docs/add-a-domain)
- [Resend: tránh xung đột DNS/MX](https://resend.com/docs/knowledge-base/how-do-i-avoid-conflicting-with-my-mx-records)
- [Resend: quyền API key](https://resend.com/changelog/new-api-key-permissions)
- [Resend: giới hạn gửi thử bằng resend.dev](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
- [Resend: hạn mức](https://resend.com/docs/api-reference/rate-limit)
- [Resend: giá dịch vụ](https://resend.com/pricing)
- [Cloudflare: Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare: giới hạn của Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
