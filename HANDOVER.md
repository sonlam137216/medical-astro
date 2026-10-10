# Bàn giao và nghiệm thu UI theo Figma mới (P10)

Lập ngày 10/10/2026. Phạm vi: các trang public và phần CMS đã có (P0–P9). **Chưa deploy.** Phần admin A1–A5 (dịch vụ, gói, bảng giá, chi nhánh/điểm đến và nối vào website) **chưa làm**, nên chưa nghiệm thu được phần đó.

## 1. Đã làm xong

| Phần  | Nội dung                                                                | Commit        |
| ----- | ----------------------------------------------------------------------- | ------------- |
| P0    | Ảnh xuất từ Figma, ảnh tham chiếu, bảng đối chiếu                       | `59c1016`     |
| P1–P3 | Tokens, font, component nền, header/footer/form, Home                   | `72f9c70`     |
| P4    | About, Services, Our Doctors                                            | `b711f52`     |
| P5    | Dental Implants                                                         | `6d41fad`     |
| P6    | Dental Packages (Single Treatments, Travel Combos)                      | `63bb4fa`     |
| P7    | CMS bài viết (migration 0002, quy tắc, admin, snapshot)                 | `d3368ce`     |
| P8    | Travel Guide, Dental Knowledge, bài chi tiết                            | `cb2c314`     |
| P9    | Kiểm link, video Home, Directions, `/locations` (migration 0003)        | `4d69ef5`     |
| P10   | Nghiệm thu, sửa lỗi a11y/SEO, header bảo mật, cổng ra mắt, tài liệu này | (xem git log) |

12 trang public (kèm trang bài viết sinh từ CMS): `/`, `/about`, `/services`, `/services/dental-implants`, `/our-doctors`, `/dental-packages`, `/dental-packages/travel-combos`, `/locations`, `/travel-guide`, `/travel-guide/<slug>`, `/dental-knowledge`, `/dental-knowledge/<slug>`.

## 2. Kết quả nghiệm thu (ngày 10/10/2026)

Kiểm trên bản build tĩnh (có dữ liệu bài viết/video từ máy chủ D1 giả) và trên Worker cục bộ (`wrangler dev`, D1 local). **Đây là kiểm phòng thí nghiệm trên máy, không phải số đo thực tế trên Cloudflare.**

| Hạng mục                        | Cách kiểm                                                            | Kết quả                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lệnh kiểm                       | `npm run check`, `lint`, `format:check`, `npm test`, `npm run build` | Đều qua (112 test)                                                                                                                                                       |
| Tràn ngang / chữ ra ngoài khung | Chrome headless, 12 trang × 4 cỡ (1440, 1024, 768, 390)              | Không có (chỉ ô bẫy spam cố tình đặt ngoài màn hình)                                                                                                                     |
| Accessibility tự động           | axe-core 4.10.2, 12 trang × 2 cỡ (1440, 390)                         | Lần đầu 4 lỗi (nhãn link rỗng, vùng landmark trùng, thứ tự heading, aside lồng nhau), **đã sửa, còn 0 lỗi**                                                              |
| Bàn phím                        | Tab, Enter, Escape                                                   | Skip link ở đầu, viền focus hiện, menu mobile mở bằng Enter và đóng bằng Escape, FAQ mở bằng Enter                                                                       |
| Cấu trúc trang                  | Quét HTML đã build                                                   | Mỗi trang đúng 1 `h1`, `lang="en"`, ảnh có `alt` (ảnh trang trí để `alt` rỗng), ảnh có `width/height`, tiêu đề trang không trùng                                         |
| SEO cơ bản                      | Quét HTML                                                            | Thiếu `meta description` ở các trang chính → **đã thêm mô tả mặc định** (sửa được ở admin 'Pages (SEO)'). `noindex` vẫn bật trên mọi trang (xem mục 5)                   |
| Link nội bộ                     | `npm run check:links`                                                | Không có link hỏng, trừ 3 trang pháp lý đang chờ nội dung                                                                                                                |
| CLS (lab)                       | PerformanceObserver trong Chrome                                     | Tối đa 0,017 (mục tiêu ≤ 0,1)                                                                                                                                            |
| LCP, INP                        | —                                                                    | **Chưa đo được có ý nghĩa**: chạy trên máy cục bộ không có mạng thật. Cần đo trên staging (cache hit và miss), tách mobile/desktop                                       |
| Trọng lượng                     | Quét thư mục build                                                   | Không có file JS ở phía khách (script nhỏ nằm trong trang), CSS tổng ~40 KB, font ~460 KB (16 file theo từng bộ ký tự, chỉ tải khi dùng), ảnh tải lười ngoài hero        |
| Quyền truy cập admin            | `curl` trên Worker cục bộ                                            | Chưa đăng nhập: mọi trang `/admin` và mọi POST bị chuyển về trang đăng nhập; đăng nhập sai origin trả 403; trang admin có `no-store`, `noindex`, `x-frame-options: DENY` |
| Admin hồi quy                   | Duyệt 18 trang admin, thêm/sửa, Publish                              | Đều 200; Publish tạo revision và xếp job (báo 'not_configured' vì chưa có token GitHub, đúng thiết kế)                                                                   |
| Form tư vấn                     | `curl`                                                               | Hợp lệ lưu được; gửi trùng bị chặn; email sai 422; honeypot không lưu; sai origin 403; rate limit 429; tên chứa HTML được escape ở hộp thư admin                         |
| Header bảo mật trang public     | `curl` trên Worker                                                   | Trước: không có. **Đã thêm** `public/_headers` (nosniff, referrer-policy, frame DENY, permissions-policy); cache `immutable` của `/_astro/*` vẫn giữ                     |

## 3. Ảnh trước / sau

- Figma mới (tham chiếu): `docs/design/figma-2026-10-10/references/pages/<trang>/NN.jpg`
- UI cũ (trước khi làm): `docs/design/figma-2026-10-10/references/current/<trang>.jpg`
- UI sau khi làm (nghiệm thu): `docs/design/figma-2026-10-10/references/final/<trang>-1440.jpg` (50%) và `<trang>-390.jpg` (70%), 8 trang có trong Figma hoặc dùng mẫu của Figma. Trang bài viết không có ảnh vì chưa có bài thật.
- Khác biệt có chủ ý so với Figma được ghi trong `UI_UPDATE_PLAN.md` (mục 'Tiến độ' của từng phần) và `docs/design/figma-2026-10-10/COMPARISON.md`.

## 4. Cần chủ dự án quyết định hoặc cung cấp

1. **Trang pháp lý** (Privacy Policy, Legal Disclaimer, Cookie settings): cần nội dung do phòng khám cung cấp. Phần public hiện không đặt cookie và không có analytics, nên 'Cookie settings' có thể bỏ. Ba link còn 404 trong dữ liệu mẫu.
2. **News** có làm mục riêng không (hiện footer không có News).
3. **Trang video riêng** hay chỉ một video ở Home (hiện chỉ có video Home, chọn ở Site details).
4. **'Send Us a Photo'**: qua WhatsApp hay upload (chưa làm, ngoài phạm vi).
5. **Domain**, tài khoản Cloudflare, custom domain cho media (R2), region D1, token GitHub cho Publish.
6. **Nội dung thật**: xem mục 5.

## 5. Dữ liệu mẫu còn trên site

Chạy `npm run build` rồi `npm run check:launch`: liệt kê từng thứ còn là dữ liệu mẫu trên các trang đã build (hiện 20 loại, ví dụ giá `600$` / `C$1,250`, thống kê `30,000+`, `4.9/5 Google Reviews`, `20+ countries`, `15+ Years`, 6 thẻ 'Experienced team' giống nhau, 5 thẻ dịch vụ và 6 thẻ gói giống nhau, ảnh chân dung bác sĩ dùng chung, ảnh phòng khách sạn thay ảnh phòng khám, ảnh X-quang, ảnh bệnh nhân thật trước/sau, bài mẫu ở Home, thẻ điểm đến Da Nang lặp, câu trả lời FAQ và phương pháp bảng giá còn trống). Lệnh này **thoát lỗi (mã 1) cho đến khi hết dữ liệu mẫu**, dùng làm cổng trước khi ra mắt; nó không nằm trong CI.

Phần admin đã chặn Publish lên production khi còn dùng mẫu cho Site details, Menu, Bác sĩ; các mục còn lại ở trên **nằm cứng trong code** cho đến khi làm A1–A5 (dịch vụ, gói, giá, chi nhánh) và `page_sections` (chữ/số liệu từng trang).

## 6. Checklist trước khi deploy

1. Tạo D1 production và điền `database_id` thật vào `wrangler.jsonc` (xem `db/README.md`).
2. **Áp dụng migration lên D1 staging: `npm run db:migrate:staging`** (cần cho `0002_articles_cms.sql` và `0003_site_intro_video.sql`; `0001` đã áp dụng). Production: `npm run db:migrate:production`.
3. Tạo tài khoản admin: `npm run admin:create -- <email> --remote [--env staging]`.
4. Kiểm lại `wrangler.jsonc` sau mọi lệnh `wrangler ... create` (từng tự thêm binding lạ).
5. Cấu hình secret/biến (xem `PUBLISHING.md`, `.dev.vars.example`): `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO`, token Cloudflare có quyền D1 trong GitHub Environment, `R2_PUBLIC_BASE_URL` khi có domain media.
6. Thử trên staging: đăng nhập admin (PBKDF2 với giới hạn CPU của Workers), form tư vấn, upload ảnh/video, Publish → build → deploy, đo LCP/INP (cache hit và miss).
7. Nhập nội dung thật (Site details, Menu, Bác sĩ, FAQ, bài viết, video), rồi chạy `npm run build` với `CONTENT_REVISION_ID` của bản sắp ra mắt và `npm run check:launch`, `npm run check:links`.
8. Khi ra mắt: bỏ `noindex` (hiện cứng trong `BaseLayout`/`SiteLayout`, kế hoạch xử lý theo môi trường) và thêm `sitemap`/`robots.txt`.

## 7. Giới hạn và rủi ro đã biết

- **Chưa có Content-Security-Policy** ở trang public: trang có script nội tuyến nhỏ nên cần băm (hash) trước. Các header khác đã có.
- **`noindex` đang bật ở mọi trang** theo thiết kế (chưa ra mắt). Chưa có sitemap, `robots.txt`, JSON-LD, ảnh chia sẻ (`og:image`).
- **Mã quốc gia của số điện thoại**: server chỉ kiểm định dạng (`+` và 1–4 chữ số), không kiểm có thuộc danh sách 12 mã của ô chọn; một request tự chế có thể lưu mã không có thật (vô hại, chỉ là dữ liệu).
- **Ô tìm kiếm bài viết** chỉ lọc thẻ trên trang (tiêu đề, tóm tắt, chuyên mục), không có tìm toàn site.
- **Chưa thử trên Cloudflare thật**: PBKDF2 100.000 vòng với 10 ms CPU của gói Free, media qua custom domain, workflow GitHub sau khi đổi sang D1, phát video thật (mới thử bằng file MP4 giả).
- **Responsive, hover/focus** là phần tự bổ sung (Figma chỉ có desktop).
- axe không kết luận được độ tương phản chữ trên ảnh nền (hero): đã xem mắt, lớp phủ navy/trắng đủ đậm, nhưng khi thay ảnh hero cần xem lại.
- Đáp án y khoa (FAQ, bài viết Dental Knowledge) phải do phòng khám cung cấp; hệ thống chặn bài Dental Knowledge thiếu người duyệt chuyên môn.

## 8. Lệnh hay dùng

```
npm run check && npm run lint && npm run format:check && npm test && npm run build
npm run check:links    # sau build: link nội bộ và anchor
npm run check:launch   # sau build: dữ liệu mẫu còn lại (thoát lỗi cho đến khi hết)
```
