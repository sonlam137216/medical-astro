# Kế hoạch cập nhật UI và chức năng theo Figma mới

Ngày lập: 10/10/2026. Trạng thái: **bản kế hoạch để bổ sung; chưa triển khai**.

Nguồn thiết kế: [Figma — Melatec](https://www.figma.com/design/9A1cfRPC1hncD00yh2t1BU/Untitled?node-id=0-1&p=f&t=BhkYqiP9QiBaOoOC-0).

## 1. Mục tiêu và phạm vi

- Cập nhật UI theo thiết kế hiện tại: bố cục, thứ tự section, màu, font, hình ảnh, kích thước, khoảng cách, viền và các trạng thái tương tác được thể hiện trong Figma.
- Hoàn thiện các trang, khối nội dung và luồng tương tác còn thiếu, theo từng phần độc lập có thể xem trước và nghiệm thu.
- Admin quản lý đầy đủ dịch vụ, gói điều trị/combo, bảng giá và địa điểm; dữ liệu phải đi từ chỉnh sửa → xem trước → publish → website, không chỉ có màn hình CRUD.
- **Nguyên tắc căn chỉnh (10/10/2026):** không cần khớp từng pixel với Figma. Button hoặc chữ bị lệch trong Figma (căn lề, khoảng cách, chữ không nằm giữa…) thì tự sửa cho đúng; layout được phép căn chỉnh lại cho phù hợp, miễn giữ cấu trúc, thứ tự section, màu, hình và nội dung. Lệch đáng kể thì ghi một dòng vào `docs/design/figma-2026-10-10/COMPARISON.md`.
- Giữ Astro + TypeScript, Cloudflare D1/R2 và quy trình publish hiện có. Tái sử dụng component và API phù hợp.
- Site tiếp tục chỉ có tiếng Anh. Các đoạn tiếng Việt, giá, nhận xét và số liệu mẫu trong Figma không mặc nhiên là nội dung được duyệt để xuất bản.
- Lập kế hoạch không đồng nghĩa với triển khai hoặc deploy. Chỉ thực hiện phần được người dùng chọn ở bước tiếp theo.

## 2. Cơ sở đối chiếu và giới hạn hiện tại

Đã đọc cấu trúc và nội dung layer của Figma mới, đối chiếu với route, component và dữ liệu trong repository. Có 7 trang public hiện hữu: Home, About, Services, Dental Implants, Our Doctors, Single Treatments và Travel Combos. Figma mới còn có Dental Travel Guide, Dental Knowledge và Single Post chưa có route tương ứng.

Chưa hoàn tất đối chiếu ảnh chụp thiết kế với giao diện chạy thực tế. Figma MCP đang báo hết quota Starter khi lấy design context/screenshot. Danh sách dưới đây là phạm vi công việc và các khác biệt đã thấy trong cấu trúc/code, không phải kết quả nghiệm thu pixel. Cần lấy lại design context chi tiết, ảnh tham chiếu và asset gốc trước khi sửa giao diện; không suy đoán font, màu hoặc crop ảnh từ dữ liệu cũ.

Schema hiện đã có `services`, `doctor_services`, `packages`, `package_items`, `locations`, `destinations` và `articles`. Các bảng có sẵn chưa đồng nghĩa với module hoàn chỉnh: CMS và snapshot public hiện chưa nối đầy đủ các nhóm này. Khi triển khai phải tái sử dụng/mở rộng schema hiện có bằng migration mới; bảng giá có cấu trúc và quan hệ bổ sung cần thiết kế sau khi đối chiếu.

Trạng thái dùng cho từng phần: `Chưa bắt đầu` → `Đang đối chiếu` → `Đang làm` → `Chờ kiểm tra` → `Hoàn tất`. Nếu thiếu đầu vào, ghi cụ thể trong mục ghi chú, không đánh dấu hoàn tất.

## 3. Danh sách phần việc

| Mã  | Phần việc                                           | Phụ thuộc                         | Trạng thái                                                                      |
| --- | --------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| P0  | Chốt bản thiết kế và lập bảng đối chiếu trực quan   | Không                             | Chờ kiểm tra (còn: logo/icon vector, font thật, chủ dự án duyệt bảng đối chiếu) |
| P1  | Tokens, font, asset và component nền tảng           | P0                                | Chờ kiểm tra                                                                    |
| P2  | Header, footer, social và form dùng chung           | P1; nối danh mục form sau A1/A5   | Chờ kiểm tra                                                                    |
| P3  | Home                                                | P2; dữ liệu A1–A5; bài viết P7/P8 | Chờ kiểm tra                                                                    |
| P4  | About, Services và Our Doctors                      | P2; A1/A5                         | Chờ kiểm tra (còn: route chi tiết dịch vụ từ CMS, chờ A1)                       |
| P5  | Dental Implants                                     | P2; A1–A3/A5                      | Chưa bắt đầu                                                                    |
| P6  | Dental Packages: Single Treatments và Travel Combos | P2; A1–A5                         | Chưa bắt đầu                                                                    |
| P7  | Mô hình nội dung và CMS bài viết                    | P0, A0; quan hệ địa điểm A4       | Chưa bắt đầu                                                                    |
| P8  | Travel Guide, Dental Knowledge và Single Post       | P2, P7                            | Chưa bắt đầu                                                                    |
| P9  | Liên kết, video và tương tác còn thiếu              | Các trang liên quan               | Chưa bắt đầu                                                                    |
| A0  | Nền tảng admin và quan hệ dữ liệu                   | P0 về cấu trúc nội dung           | Chưa bắt đầu                                                                    |
| A1  | Admin dịch vụ và trang chi tiết dịch vụ             | A0                                | Chưa bắt đầu                                                                    |
| A2  | Admin gói điều trị và combo du lịch                 | A0, A1, A4                        | Chưa bắt đầu                                                                    |
| A3  | Admin bảng giá và so sánh quốc gia                  | A0, A1, A2                        | Chưa bắt đầu                                                                    |
| A4  | Admin chi nhánh và điểm đến du lịch                 | A0                                | Chưa bắt đầu                                                                    |
| A5  | Kết nối admin → snapshot → website và form          | A1–A4; tích hợp từng module       | Chưa bắt đầu                                                                    |
| P10 | Nghiệm thu tổng thể và bàn giao                     | P1–P9 và A0–A5                    | Chưa bắt đầu                                                                    |

### P0 — Chốt bản thiết kế và lập bảng đối chiếu trực quan

- [ ] Xác định các nhóm/frame chính thức cho từng trang; phân biệt layer nháp, trùng lặp và thiết kế được chọn.
- [ ] Lấy design context và ảnh tham chiếu cho từng trang/section; ghi node ID và kích thước canvas thực tế.
- [ ] Kiểm tra có thiết kế mobile/tablet và các trạng thái hover, focus, mở menu, mở FAQ hay không.
- [ ] Chụp UI hiện tại ở cùng kích thước để tạo cặp ảnh trước/sau cho từng phần.
- [ ] Lập danh sách font, logo, icon, ảnh, video cần dùng và asset còn thiếu.
- [ ] Xác định phần nào là thay đổi UI, phần nào cần thêm dữ liệu hoặc chức năng.

**Tiến độ 10/10/2026:** đã xuất 136 layer ảnh (fill ảnh, 2x PNG) từ Figma mới vào `docs/design/figma-2026-10-10/assets/`, kèm `assets-manifest.json` (file → trang → node ID; một file có thể khớp nhiều node vì layer trùng tên) và `image-checklist.md`. Đã chụp ảnh tham chiếu 10 trang (48 ảnh, cuộn từng đoạn) vào `docs/design/figma-2026-10-10/references/pages/` (xem `README.md` ở đó, gồm các quan sát: font khác nhau giữa Home và trang khác, footer News/Contacts, lỗi chính tả, dữ liệu mẫu lặp). Đã chụp UI hiện tại (`references/current/`) và lập bảng đối chiếu `docs/design/figma-2026-10-10/COMPARISON.md` (khác biệt dùng chung, từng trang, lỗi trong Figma, asset, thứ tự làm). Chưa xuất logo/icon dạng vector, chưa xác nhận mobile/tablet/hover (file không có). Ảnh `medical-images/` (export cũ của Codex, phần lớn là lớp chữ) không dùng.

**Đầu ra:** bảng đối chiếu theo trang, ảnh tham chiếu và danh sách asset. **Đạt khi:** mỗi trang có nguồn thiết kế rõ ràng; các chi tiết chưa xác định được ghi riêng.

### P1 — Tokens, font, asset và component nền tảng

- [ ] Đo lại màu, font family/weight, type scale, line-height, container, spacing và border radius từ thiết kế mới.
- [ ] Cập nhật tokens tập trung; kiểm tra ảnh hưởng lên admin đang dùng chung một số tokens.
- [ ] Chuẩn hóa Button, Section, SectionIntro, PageHero và các loại card; dùng biến thể khi thiết kế giữa các trang khác nhau.
- [ ] Đưa asset đúng từ thiết kế vào project; giữ đúng vị trí, tỷ lệ, crop và chất lượng hiển thị.
- [ ] Ghi lại responsive tự bổ sung ở nơi Figma không có mẫu.

**Tiến độ 10/10/2026:** đã đo font/màu/cỡ chữ từ panel Figma và cập nhật `tokens.css`; đã thêm Montserrat, đổi Cormorant sang Bold; chuẩn hóa `Button`, `SectionIntro`, `PageHero` (banner), `CtaBand`, thẻ, link-arrow; container 1040 (cột px cố định đổi sang tỉ lệ). Chưa làm: Roboto (P2), ảnh/asset đưa vào `src/assets` theo từng trang (làm khi dựng trang), logo/icon vector (cần chủ dự án), áp dụng hero banner/layout mới cho từng trang. Tokens admin dùng chung vẫn giữ tên, màu xanh/ chữ phụ đổi nhẹ.

**Đầu ra:** nền tảng UI dùng chung. **Đạt khi:** component mẫu khớp ảnh thiết kế ở viewport tham chiếu, font và asset đã kiểm chứng, không gây lỗi giao diện admin.

### P2 — Header, footer, social và form dùng chung

- [ ] Header: bố trí thông tin liên hệ, Dental Knowledge và Booking Now theo thiết kế; đồng bộ logo, menu, nhãn Dental Travel Guide và trạng thái active.
- [ ] Kiểm tra biến thể header của Dental Implants theo file mới.
- [ ] Footer: đối chiếu các cột, mục News xuất hiện ở Home, liên kết pháp lý và thông tin liên hệ; ghi riêng các khác biệt giữa các trang Figma.
- [ ] Social: cập nhật tiêu đề, bố cục thẻ và icon; URL lấy từ dữ liệu CMS, không tự tạo tài khoản hoặc địa chỉ.
- [ ] Form tư vấn: đồng bộ bố cục, label, khoảng cách, input/select, CTA và bộ chọn mã quốc gia được thể hiện trong thiết kế.
- [ ] Giữ tích hợp POST `/api/consultation`, validation, chống gửi trùng và trạng thái gửi; chuẩn hóa số điện thoại nếu thêm bộ chọn mã quốc gia.
- [ ] Kiểm tra menu mobile, bàn phím, focus và anchor tư vấn.

**Tiến độ 10/10/2026 (P2):** thanh trên xanh `#0056E5` (điện thoại + email trái; nút viền Booking Now → `#consultation` và Dental Knowledge phải), header trắng bỏ nút CTA, menu đổi 'Dental Travel Guide'; footer gradient navy dùng Roboto, tiêu đề cột in hoa, đường kẻ trên hàng pháp lý, nhãn 'Contact' (thay 'Contacts'; mục 'News' chưa thêm vì chưa có trang); Social đổi tiêu đề 'Find us and stay connected' (sửa lỗi 'SOCIA MEDIA'), 4 thẻ trắng có tên nền tảng thay chữ 'Chèn link…'; khối tư vấn dựng lại (nền navy, thẻ thông tin + thẻ form, nhãn Roboto in hoa, nút trắng); `PhoneField` mới có chọn mã quốc gia (12 mã, server ghép `phone_country` + số, bỏ số 0 đầu quốc gia, từ chối mã sai; 5 test mới ở `tests/consultation.test.ts`); `PlanVisit` dùng chung `PhoneField`; trang Dental Implants bỏ header riêng (Figma mới không có biến thể). Đã thử bằng Chrome headless ở 1440 và 500, và gửi form thử vào D1 local. Chưa làm: icon tròn/cờ +84 như Figma (dùng chữ 'VN +84'), kiểm menu mobile bằng bàn phím, trang Privacy/Legal/Cookie (P9), danh sách dịch vụ trong form vẫn tạm lấy từ footerTreatments (A1/A5).

**Đạt khi:** các thành phần dùng chung khớp mẫu trên những trang liên quan; gửi form đúng, không tạo yêu cầu thử trên production.

### P3 — Home

- [ ] Đối chiếu và cập nhật hero, dải lợi ích, dịch vụ, nội dung video, bảng giá, lý do chọn phòng khám, gallery, địa điểm, bác sĩ, quy trình và Smile Stories.
- [ ] Cập nhật bố cục và thứ tự từng section theo thiết kế mới, không chỉ thay văn bản.
- [ ] Thêm khối Dental Travel Guide / Discover the Beauty of VietNam: bài nổi bật, các bài bên cạnh và nút xem thêm.
- [ ] Bảng giá: thêm bộ chọn quốc gia; thống nhất tác động của lựa chọn lên bảng với dữ liệu đã được cung cấp, không tự tính mức tiết kiệm từ giá mẫu.
- [ ] Kiểm tra nút chuyển Smile Stories và hành vi trước/sau; chỉ làm slider so sánh khi có hai ảnh nguồn phù hợp, không giả lập trên ảnh đã ghép.
- [ ] Nối Watch video, View all videos, Directions và See all locations theo phương án P9.

**Tiến độ 10/10/2026 (P3):** Home đã dựng lại theo Figma mới ở mức bố cục (bám cấu trúc, tự căn chỉnh lại theo nguyên tắc không cần khớp pixel): hero toàn khung dùng ảnh `image 19` (`photos/home-hero.webp`) + nút WhatsApp xanh lá, 4 ô lợi ích căn giữa, thẻ dịch vụ dùng `PackageCard` (4 bullet, TOTAL, Learn more), khối 'Hear from our dentists' đảo bố cục (ảnh `image 1` sạch chữ), bảng giá có ô chọn quốc gia thật (JS nhỏ đổi cột nổi bật; không tự tính tiết kiệm), 5 thẻ số tròn ở Why Melatec, dải ảnh phòng khám nền xanh có mũi tên (cuộn ngang, không còn tiêu đề), thẻ chi nhánh có nút Directions, thẻ bác sĩ role-trên-tên (bỏ link View profile), How it works nền xanh có vòng số, Smile Stories, **khối Dental Travel Guide mới** (bài mẫu lặp từ Figma, link `/travel-guide` chưa tồn tại: P7/P8). Đã thử Chrome headless ở 1440 và 500. Chưa làm: chấm/mũi tên slider Conversations và Smile Stories (chỉ làm khi có >1 mục), video thật cho Watch video/View all videos (P9), Directions mở bản đồ thật (A4/P9), slider so sánh trước/sau thật, nội dung từ CMS cho dịch vụ/giá/bài viết (A1–A5, P7).

**Đạt khi:** đủ section, khớp bố cục và asset; các nút có hành vi rõ ràng. Khối bài viết chỉ hoàn tất sau khi có nguồn nội dung và route P8.

### P4 — About, Services và Our Doctors

- [ ] About: hero, thống kê, các khối giới thiệu, gallery, CTA, bác sĩ và quy trình.
- [ ] Services: hero, số lượng/bố cục card, CTA, hỗ trợ du lịch và quy trình.
- [ ] Our Doctors: hero, danh sách hồ sơ, ảnh, tiểu sử, chuyên môn và bố cục từng hồ sơ.
- [ ] Giữ nguồn bác sĩ từ CMS và xử lý dữ liệu trống; không thay ảnh mẫu thành hồ sơ người thật chưa xác nhận.
- [ ] Dựng route chi tiết cho các dịch vụ đã publish từ A1 theo template dịch vụ đã đối chiếu; giữ URL Dental Implants hiện có. Nội dung chưa cung cấp ở trạng thái nháp, không tự viết thông tin điều trị.

**Tiến độ 10/10/2026 (P4):** đã dựng lại ba trang ở mức bố cục (chưa commit). `PageHero variant="banner"` dùng lần đầu: ảnh phủ khung không còn bị cắt ở server (`widths` + `object-fit`, thêm prop `position`), lớp phủ đậm hơn trên mobile, chip trắng `hero-chip` trong slot `extra`. **About:** hero banner sáng dùng `home-hero.webp` với tiêu đề đầy đủ 'Welcome to Melatec Dental Clinic' (Figma), thẻ số liệu trắng chữ serif, khối 'Your home away from home' nền nhạt tiêu đề căn giữa, 'Why choose' nền navy với 6 thẻ trong suốt viền sáng (`InfoCard tone="dark"`, bỏ số 01–06), lưới ảnh phòng khám 2 cột lệch nhau, CtaBand hai nút trắng, bác sĩ nền nhạt + nút 'View all doctors' căn giữa. **Services:** hero navy (ảnh tháp Rùa rộng mới `hanoi-tower-wide.webp`, 2000px, xuất từ `image 34`), 5 thẻ dịch vụ bố cục 2+3 (hàng trên căn giữa, mọi thẻ cùng cỡ), thẻ `ServiceCard detail` căn giữa tiêu đề serif + nút pill viền 'EXPLORE SERVICES →'. **Our Doctors:** hero navy + hai chip trắng, hồ sơ là thẻ trắng (vai trò serif xanh, tên đậm, tiểu sử, gạch đầu dòng chấm xanh, chip ngôn ngữ lấy từ dữ liệu bác sĩ), vẫn đọc từ CMS và hiện chữ cái đầu khi chưa có ảnh. Dùng chung: `SeamlessJourney` (chữ đè lên ảnh có vùng mờ trắng bên trái), `TourismSupport` (tiêu đề căn giữa có gạch, thẻ serif in hoa, bỏ số) và `InfoCard` đổi theo, nên Packages và Dental Implants cũng đổi theo; đã chụp lại, không vỡ. Đã chạy check/lint/format/test (87)/build, chụp Chrome headless 1440 và 500 (không tràn ngang). **Chưa làm:** route chi tiết dịch vụ (A1; hiện cả 5 thẻ cùng dẫn tới `/services/dental-implants` như dữ liệu mẫu), nội dung 'Why choose' và 5 dịch vụ vẫn là mẫu lặp, cờ GB ở chip ngôn ngữ, so sánh từng pixel.

**Đạt khi:** từng trang có ảnh đối chiếu đạt yêu cầu; CMS bác sĩ tiếp tục hoạt động và không xuất hiện link trống mới.

### P5 — Dental Implants

- [ ] Cập nhật hero, CTA và khối thống kê theo thiết kế mới.
- [ ] Đồng bộ Treatment Costs / What You Pay at Melatec và các card.
- [ ] Bổ sung Cost Comparison / Compared with Other Countries.
- [ ] Thay/điều chỉnh các khối hiện tại để khớp Why MLT / High-Quality Implant Care at a Smarter Cost.
- [ ] Cập nhật nội dung, bố cục và vị trí form Get Your Implant Plan Before Your Flight.
- [ ] Bổ sung Your Seamless Dental Journey và Results / Real Stories. Real Smiles.
- [ ] Đồng bộ FAQ, thứ tự section và footer. Đáp án y khoa cần nội dung được phòng khám duyệt; nội dung mẫu trong Figma chỉ là tham chiếu.

**Đạt khi:** trang đủ các khối trên và đúng thứ tự trong Figma; form, bảng giá, FAQ và CTA được kiểm tra.

### P6 — Dental Packages

- [ ] Single Treatments: hero, grid gói, giá, nội dung bao gồm, CTA và phần hỗ trợ.
- [ ] Travel Combos: hero, gallery, điểm đến, bảng gói, tư vấn và Discover Vietnam.
- [ ] Đối chiếu dữ liệu riêng của gói điều trị và combo; hiện hai trang đang dùng chung `PackageGrid`/dữ liệu gói mẫu.
- [ ] Chốt lối truy cập giữa hai trang từ menu hoặc UI điều hướng, không tự thêm tab không có trong mẫu khi chưa thống nhất.
- [ ] Nối các nút Learn more, Explore more và View all với trang/luồng phù hợp.

**Đạt khi:** hai trang có bố cục đúng mẫu và luồng điều hướng đầy đủ; không dùng chung dữ liệu chỉ vì thuận tiện nếu nội dung được duyệt khác nhau.

### P7 — Nội dung và CMS bài viết

- [ ] Mở rộng bảng `articles` hiện có và thiết kế chuyên mục/quan hệ cần thiết cho bài viết: loại Travel Guide/Knowledge, slug, chuyên mục, tiêu đề, tóm tắt, ảnh, nội dung có cấu trúc, tác giả, ngày cập nhật, người duyệt chuyên môn và SEO.
- [ ] Thống nhất trường bắt buộc/tùy chọn theo từng loại bài; không bắt bài du lịch có người duyệt y khoa.
- [ ] Thêm migration mới, không sửa migration đã áp dụng; cập nhật registry/schema và validation.
- [ ] Bổ sung CRUD bài viết/chuyên mục và chọn media trong admin, dùng nền tảng CMS hiện có.
- [ ] Đưa bài viết vào snapshot/publish; build trang tĩnh từ nội dung đã xuất bản.
- [ ] Kiểm tra slug trùng, draft chưa publish, ẩn bài, nội dung rỗng và tính an toàn của nội dung hiển thị.

**Đạt khi:** tạo/sửa/publish bài thử ở local hoặc staging làm xuất hiện đúng trang public; draft chưa publish không lộ ra ngoài.

### P8 — Travel Guide, Dental Knowledge và Single Post

- [ ] Travel Guide: hero, Search Articles, grid bài và nút Explore more.
- [ ] Dental Knowledge: hero, tìm kiếm, các chuyên mục và grid bài.
- [ ] Single Post: breadcrumb, tiêu đề, metadata tác giả/ngày cập nhật, nội dung/ảnh, mục lục, sidebar dịch vụ và form tư vấn.
- [ ] Thêm khối người duyệt chuyên môn và bài liên quan theo loại bài/dữ liệu có thật.
- [ ] Chốt URL chi tiết theo loại bài; xử lý bài không tồn tại, slug đổi và kết quả tìm kiếm rỗng.
- [ ] Chốt cách tìm kiếm/lọc phù hợp nội dung tĩnh; chỉ thêm phân trang khi cần, vì chưa xác nhận yêu cầu này từ thiết kế.
- [ ] Kết nối dữ liệu bài viết về Home và các nút khám phá liên quan.

**Đạt khi:** đủ ba mẫu trang, UI khớp Figma, tìm kiếm/lọc/mục lục/liên kết bài hoạt động và SEO có trong HTML dựng sẵn.

### P9 — Liên kết, video và tương tác còn thiếu

- [ ] Kiểm toàn bộ link nội bộ, anchor và `href="#"`; phân biệt dữ liệu chưa cung cấp với chức năng chưa làm.
- [ ] Nối video ở Home với media MP4/player đã có; xác định đích của View all videos trước khi tạo trang mới.
- [ ] Nối Directions với bản đồ từ A4; See all locations dẫn tới danh sách chi nhánh. Bố cục trang chưa có mẫu Figma được ghi rõ là phần bổ sung.
- [ ] Chốt News là mục riêng hay liên kết đến nhóm nội dung đã có; chưa thấy mẫu trang News riêng được xác nhận.
- [ ] Chốt trang Privacy Policy, Legal Disclaimer và hành vi Cookie settings theo nội dung/cơ chế thực tế của website.
- [ ] Nối các dịch vụ và gói với route/CTA từ A1/A2/A5, mang theo lựa chọn vào form tư vấn; không thêm booking theo lịch hoặc thanh toán.
- [ ] Xác định Send Us a Photo là hướng dẫn liên hệ qua WhatsApp hay yêu cầu upload trên website; giữ ngoài triển khai upload cho đến khi chốt rõ phạm vi.

**Đạt khi:** các CTA trong phạm vi đã chọn có đích/hành vi hữu ích; mục còn chờ đầu vào được ghi rõ, không báo hoàn tất giả.

### A0 — Nền tảng admin và quan hệ dữ liệu

- [ ] Lập bản đồ trường dữ liệu → vị trí trên website; đối chiếu schema hiện có, chỉ thêm bảng/trường/quan hệ còn thiếu bằng migration mới.
- [ ] Mỗi module có danh sách, tìm kiếm/lọc, thêm/sửa, chọn media, sắp xếp, chọn hiển thị nổi bật và ẩn/khôi phục. Phân trang danh sách khi cần; trạng thái rỗng và lỗi có hướng dẫn rõ ràng.
- [ ] Dùng một vai trò `admin`, middleware xác thực, validation phía server và audit hiện có; không thêm hệ thống phân quyền mới.
- [ ] Dùng ID ổn định cho quan hệ; kiểm slug trùng, URL sai, tham chiếu tới bản ghi ẩn/xóa và media đang được dùng. Ưu tiên ẩn; chỉ cho xóa khi không còn phụ thuộc và có thông báo tác động.
- [ ] Có xem trước nội dung nháp được bảo vệ bằng đăng nhập, không cache công khai; chỉnh sửa nháp không thay đổi website live.
- [ ] Giữ giao diện admin theo hệ thống hiện tại, bổ sung đủ màn hình và thao tác cho nghiệp vụ; Figma public không mặc nhiên là mẫu UI admin.

**Đạt khi:** từng module có thể thao tác bằng admin mà không sửa SQL hoặc file code; dữ liệu sai bị từ chối, thay đổi được ghi audit và chưa publish không lộ ra public.

### A1 — Admin dịch vụ

- [ ] Quản lý tên, slug, tóm tắt, ảnh/hero, nội dung chi tiết có cấu trúc theo template Figma, lợi ích, quy trình, FAQ, CTA và SEO.
- [ ] Quản lý quan hệ bác sĩ–dịch vụ qua `doctor_services`; chọn gói, mức giá và chi nhánh liên quan bằng ID thay vì nhập lại tên.
- [ ] Chọn thứ tự và dịch vụ nổi bật ở Home; điều khiển danh sách Services và sidebar bài viết từ cùng nguồn dữ liệu.
- [ ] Dựng trang chi tiết cho dịch vụ đã publish; giữ `/services/dental-implants`, kiểm xung đột route và tạo redirect khi đổi slug đã xuất bản.
- [ ] Khi ẩn dịch vụ, kiểm ảnh hưởng tới gói, giá, menu, bài viết và form; yêu cầu xử lý quan hệ không hợp lệ trước publish.

**Đạt khi:** thêm một dịch vụ trong admin, liên kết bác sĩ/ảnh/FAQ và publish sẽ tạo đúng card, trang chi tiết và lựa chọn tư vấn; sửa/ẩn không để lại liên kết hỏng.

### A2 — Admin gói điều trị và combo du lịch

- [ ] Quản lý riêng `single_treatment` và `travel_combo`: tên, slug, mô tả, ảnh/gallery, nội dung bao gồm/không bao gồm, điều kiện và thứ tự hiển thị.
- [ ] Quản lý các mục trong gói qua `package_items`; bổ sung quan hệ nhiều dịch vụ nếu gói cần, giữ tương thích dữ liệu hiện có.
- [ ] Liên kết gói với chi nhánh áp dụng, điểm đến và dịch vụ; combo có thông tin lịch trình/thời lượng và hỗ trợ du lịch khi được cung cấp.
- [ ] Liên kết giá chuẩn từ A3; hỗ trợ giá cố định, giá từ, khoảng giá hoặc yêu cầu báo giá. Không nhập lại một giá ở nhiều module.
- [ ] Có nội dung chi tiết gói và CTA tư vấn có sẵn lựa chọn gói; định nghĩa đích Learn more. Nếu cần trang chi tiết chưa có mẫu, bổ sung theo component hiện có và ghi rõ để kiểm tra UI.
- [ ] Quản lý nổi bật, ẩn/khôi phục, SEO cho trang chi tiết và redirect khi đổi slug.

**Đạt khi:** hai loại gói hiển thị đúng danh sách, nội dung, giá, địa điểm và CTA; thay giá từ nguồn chuẩn cập nhật đồng nhất sau publish.

### A3 — Admin bảng giá và so sánh quốc gia

- [ ] Thiết kế nguồn giá chuẩn cho dịch vụ/gói: số tiền, tiền tệ, loại giá, đơn vị (răng, trụ, hàm, gói…), nội dung bao gồm/loại trừ, điều kiện, chi nhánh áp dụng và ngày hiệu lực/hết hiệu lực.
- [ ] Chuẩn hóa trường giá cũ `services.price_text` và `packages.price_amount/currency` về nguồn này bằng quy tắc chuyển đổi rõ ràng; không duy trì hai giá có thể sửa độc lập.
- [ ] Quản lý bảng giá, nhóm/dòng, thứ tự và vị trí sử dụng ở Home, Dental Implants, Services và Packages.
- [ ] Quản lý dữ liệu tham chiếu theo quốc gia: dịch vụ tương đương, mức giá/khoảng giá, tiền tệ, nguồn, ngày cập nhật, số phòng khám khi có dữ liệu và phần giải thích phương pháp.
- [ ] Bộ chọn quốc gia thực sự thay đổi dữ liệu tham chiếu và mức tiết kiệm. Chỉ tính khi cùng đơn vị/phạm vi điều trị và tiền tệ so sánh; nếu cần quy đổi, lưu tỷ giá, nguồn và ngày dùng, không tự lấy tỷ giá live.
- [ ] Validate giá không âm, khoảng min/max, tiền tệ, ngày hiệu lực và các mức giá trùng phạm vi. Thiếu dữ liệu thì hiển thị yêu cầu báo giá/không đủ dữ liệu, không xem giá trống là 0.
- [ ] Mức tiết kiệm được suy ra từ giá đã duyệt, không nhập số phần trăm độc lập. Không hiển thị giá đối chiếu mẫu như số liệu thật.
- [ ] Với site dựng sẵn, publish/build áp dụng giá có hiệu lực tại thời điểm build; admin hiển thị cảnh báo cần publish lại khi tới ngày hiệu lực/hết hạn. Không hứa tự chuyển giá theo thời gian nếu chưa có lịch build tương ứng.

**Đạt khi:** chỉnh giá trong admin rồi publish cập nhật đúng mọi vị trí; kiểm được từng loại giá, đổi quốc gia, thiếu dữ liệu, tiền tệ khác nhau và giá hết hạn.

### A4 — Admin chi nhánh và điểm đến du lịch

- [ ] Tách rõ `locations` (chi nhánh phòng khám) và `destinations` (điểm đến du lịch); tái sử dụng hai bảng hiện có.
- [ ] Chi nhánh: tên, slug, địa chỉ, liên hệ/WhatsApp, giờ mở cửa, mô tả, ảnh/gallery, đường dẫn bản đồ và dịch vụ/gói áp dụng.
- [ ] Điểm đến: tên, slug, tóm tắt, nội dung giới thiệu, ảnh/gallery, bài Travel Guide liên quan và combo phù hợp.
- [ ] Quản lý thứ tự/nổi bật, ẩn/khôi phục và SEO khi có trang chi tiết; kiểm quan hệ trước khi ẩn/xóa.
- [ ] Home và Travel Combos dùng dữ liệu đã publish; Directions mở đúng bản đồ. Có đích danh sách chi nhánh cho See all locations và đích nội dung phù hợp cho Explore more.
- [ ] Phân biệt liên hệ chi nhánh với thông tin liên hệ chung trong Site details; dữ liệu thiếu không tự thay bằng địa chỉ/số điện thoại mẫu.

**Đạt khi:** thêm/sửa một chi nhánh hoặc điểm đến trong admin được phản ánh đúng ở các trang và combo liên quan sau publish; không nhầm điểm du lịch với nơi cung cấp điều trị.

### A5 — Nối dữ liệu admin với website và form

- [ ] Mở rộng snapshot, bộ đọc nội dung lúc build và kiểm tra publish cho A1–A4; ghi rõ tương thích với revision cũ và phiên bản schema snapshot.
- [ ] Chuyển dịch vụ, gói, giá và địa điểm ở Home/Services/Implants/Packages/Travel Guide cùng menu/sidebar liên quan từ dữ liệu hardcode sang nội dung đã xuất bản.
- [ ] Phân biệt module chưa cấu hình với danh sách cố ý để trống: ẩn tất cả mục không được làm xuất hiện lại dữ liệu mẫu. Production không được âm thầm dùng fallback mẫu cho các module này.
- [ ] Form chọn dịch vụ từ danh mục đã publish; CTA dịch vụ/gói/chi nhánh đặt sẵn lựa chọn khi phù hợp. Server kiểm ID theo danh mục được công bố, lưu ngữ cảnh và tên tại thời điểm gửi để lịch sử tư vấn không mất khi nội dung đổi tên/ẩn.
- [ ] Hộp thư admin hiển thị dịch vụ/gói/chi nhánh người dùng quan tâm, hỗ trợ lọc liên quan và giữ trạng thái/ghi chú hiện có. Tương thích các yêu cầu cũ chỉ có tên dịch vụ dạng text.
- [ ] Kiểm tra tham chiếu giữa module và media trước publish; lỗi build không thay bản live. Xem trước dữ liệu nháp phải cùng cấu trúc render với public.
- [ ] Chuyển dữ liệu mẫu bằng quy trình rà soát/nạp bản nháp; không tự publish giá, hồ sơ hoặc thông tin kinh doanh chưa xác nhận.

**Đạt khi:** kiểm thử trọn luồng local/staging: tạo dịch vụ → chi nhánh/điểm đến → gói → giá → xem trước → publish → website hiển thị → gửi tư vấn → admin nhận đúng ngữ cảnh. Sửa nháp không ảnh hưởng live, publish cập nhật đồng nhất, ẩn mục không hồi sinh placeholder.

### P10 — Nghiệm thu và bàn giao

- [ ] So sánh screenshot website với Figma ở đúng viewport tham chiếu, kiểm từng section và asset.
- [ ] Kiểm responsive desktop/tablet/mobile; dùng frame Figma nếu có, ghi rõ cách thích ứng tự bổ sung nếu không có.
- [ ] Kiểm tràn ngang, chữ bị cắt, ảnh sai tỷ lệ, anchor, trạng thái menu, form, tìm kiếm, FAQ và video.
- [ ] Kiểm accessibility cơ bản: heading, label, alt, bàn phím và focus.
- [ ] Chạy check/lint/build và các test liên quan đến thay đổi logic, API, CMS hoặc schema; không viết test hình thức cho thay đổi CSS đơn giản.
- [ ] Kiểm hồi quy admin, publish và dữ liệu đã xuất bản sau các thay đổi dùng chung.
- [ ] Nghiệm thu A0–A5 bằng thao tác admin thực tế: thêm/sửa/ẩn/khôi phục, quan hệ dữ liệu, giá, xem trước, publish và nhận tư vấn; kiểm quyền truy cập, migration và tương thích revision/yêu cầu cũ.
- [ ] Rà toàn bộ dữ liệu kinh doanh của bốn module: không còn giá/địa điểm/dịch vụ/gói mẫu được dùng trên production; mục thiếu phải được bổ sung hoặc ẩn có chủ đích.
- [ ] Cập nhật README/CLAUDE/SOURCES theo trạng thái thực tế; bàn giao ảnh trước/sau, phần đã xong và phần còn chờ.
- [ ] Deploy là bước riêng khi người dùng yêu cầu, không tự deploy từ việc duyệt plan.

## 4. Cách thực hiện từng phần

1. Người dùng chọn mã phần việc và bổ sung yêu cầu nếu có.
2. Đối chiếu node Figma liên quan, xác định đầu vào và các phụ thuộc cần thiết.
3. Cập nhật phần đã chọn; nếu cần thay component dùng chung, kiểm các trang bị ảnh hưởng.
4. Chạy kiểm tra phù hợp và cung cấp preview/ảnh trước-sau để đánh giá kết quả.
5. Cập nhật trạng thái, ghi phần còn thiếu và bổ sung plan; chưa tự chuyển sang một phạm vi mới chưa được chọn.

Thứ tự đề xuất sau khi mở rộng admin:

1. **P0 → A0 → P1 → P2:** xác định thiết kế, dữ liệu và nền tảng dùng chung.
2. **A1 → A4 → A2 → A3 → A5:** hoàn thiện bốn nhóm quản lý và luồng xuất bản. A5 được tích hợp/kiểm tra theo từng module, không để toàn bộ việc nối dữ liệu tới cuối.
3. **P3 → P4 → P5 → P6:** cập nhật UI các trang hiện hữu bằng dữ liệu CMS; có thể ưu tiên P5 nếu cần landing page implant trước.
4. **P7 → P8:** bài viết và ba mẫu trang mới; hoàn thiện khối bài viết ở Home.
5. **P9 → P10:** nối các đích còn thiếu và nghiệm thu toàn bộ.

Có thể làm bố cục một trang trước khi module admin tương ứng hoàn tất, nhưng chỉ đánh dấu hoàn tất khi đã nối dữ liệu, publish và kiểm được luồng sử dụng thực tế. “Website hoạt động hoàn chỉnh” trong plan này gồm cả UI public và các module admin đã liệt kê; không mở rộng sang checkout, booking theo lịch hoặc page builder tự do. Các section biên tập khác của Home (hero, thống kê, câu chuyện…) chưa mặc nhiên có editor riêng ngoài phạm vi đã ghi.

## 5. Các quyết định còn mở

Không cần trả lời tất cả ngay; xử lý trước phần việc có liên quan.

| Quyết định/đầu vào                                                        | Cần trước                    |
| ------------------------------------------------------------------------- | ---------------------------- |
| Các nhóm/frame chính thức; design context, screenshot và asset mới        | P1 và từng trang             |
| Font/logo gốc nếu không lấy được từ thiết kế                              | P1                           |
| Mobile/tablet theo frame nào, hoặc cho phép tự thích ứng từ desktop       | P2–P6, P8                    |
| Danh mục dịch vụ, quan hệ bác sĩ, nội dung điều trị và FAQ đã duyệt       | A1/P4/P5                     |
| Gói điều trị/combo, hạng mục bao gồm, điều kiện và địa điểm áp dụng       | A2/P6                        |
| Giá, tiền tệ, đơn vị, hiệu lực, dữ liệu tham chiếu và phương pháp so sánh | A3/P3/P5                     |
| Chi nhánh, điểm đến, bản đồ, liên hệ và giờ mở cửa                        | A4                           |
| Nội dung bài viết, chuyên mục, URL và người duyệt                         | P7/P8                        |
| Video, ảnh trước/sau và số câu chuyện                                     | P3/P5/P9                     |
| Đích News, See all locations, View all videos và link các gói/dịch vụ     | P6/P9                        |
| Nội dung pháp lý và hành vi Cookie settings                               | P9                           |
| Send Us a Photo qua WhatsApp hay upload riêng                             | Chỉ khi triển khai luồng này |

## 6. Yêu cầu bổ sung và thay đổi ưu tiên

Thêm một dòng cho mỗi yêu cầu mới; giữ nguyên các quyết định đã chốt trừ khi người dùng yêu cầu đổi.

| Ngày       | Mã phần    | Yêu cầu bổ sung                                                                           | Ưu tiên | Trạng thái/quyết định                                                 |
| ---------- | ---------- | ----------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------- |
| 10/10/2026 | Toàn bộ UI | UI phải bám thiết kế hiện tại, bao gồm bố cục và hình thức hiển thị                       | Cao     | Đã ghi vào phạm vi; chưa triển khai                                   |
| 10/10/2026 | Kế hoạch   | Lập plan trước để bổ sung và thực hiện từng phần                                          | Cao     | Đã lập plan; chờ chọn phần triển khai                                 |
| 10/10/2026 | A0–A5      | Quản lý đầy đủ dịch vụ, gói điều trị, bảng giá, địa điểm; nối admin với website và tư vấn | Cao     | Đã bổ sung phạm vi, phụ thuộc và tiêu chí nghiệm thu; chưa triển khai |
