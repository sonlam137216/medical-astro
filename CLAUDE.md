# CLAUDE.md — Melatec

Website giới thiệu dịch vụ nha khoa kết hợp hỗ trợ khách quốc tế đến Việt Nam. Thiên về nội dung, hình ảnh, thông tin bác sĩ, gói dịch vụ và tiếp nhận yêu cầu tư vấn.

Tài liệu gốc: [WEBSITE_TECHSTACK.md](./WEBSITE_TECHSTACK.md) (tiếng Việt). Đọc file đó trước khi quyết định kiến trúc. File này chỉ tóm tắt các quy tắc cần nhớ khi làm việc.

## Trạng thái hiện tại

- **Giai đoạn 1 đã xong:** skeleton Astro 7 + `@astrojs/cloudflare` 14 + Wrangler 4, TypeScript strict. Git repo nhánh `main`. Chưa có remote, chưa deploy (chưa có tài khoản Cloudflare).
- **Giai đoạn 2 (UI public) đã dựng xong ở mức bố cục, còn tinh chỉnh.** 7 trang tĩnh đã có: `/`, `/about`, `/services`, `/services/dental-implants`, `/our-doctors`, `/dental-packages` (frame Single Treatments), `/dental-packages/travel-combos`. Tokens ở `src/styles/tokens.css`, font tự host (Inter variable + Cormorant Garamond 600), component chung ở `src/components` (Header, Footer, Button, Section, SectionIntro, PageHero, CtaBand, ConsultationSection, PlanVisit, SocialBar...), thẻ ở `src/components/cards`, section riêng của Home ở `src/components/home`. Nội dung nằm ở `src/data/*.ts` (sẽ chuyển sang Supabase ở giai đoạn 5). Ảnh nằm ở `src/assets/images` (xem `SOURCES.md` ở đó). Đã kiểm trực quan với Figma ở 1440 và kiểm không tràn ngang ở ~500px; chưa so từng pixel.
- **Giai đoạn 3 (database) đã xong và đã đẩy lên project thật (2026-10-05).** `supabase/migrations` (4 file) đã áp dụng trên project `npbiucxxcnppgecmkhdz`: 20 bảng `public`, RLS bật hết, 25 policy, `anon` không có quyền nào (đã kiểm bằng REST với publishable key và secret key). **Không sửa 4 migration này**, sai thì viết migration mới. Không drop bảng tay trên Dashboard (từng làm, lịch sử migration lệch với DB thật); cần làm lại thì dùng `supabase migration repair`. `supabase/seed.sql` chỉ local, `supabase/tests/database` (82 test pgTAP), `src/types/database.ts` sinh tự động. Việc chủ dự án còn phải làm: tạo tài khoản admin và thêm vào `public.admins` (xem `supabase/README.md`).
- **Chưa có trong Figma, tự bổ sung:** toàn bộ responsive mobile/tablet, menu hamburger, trạng thái hover/focus. Trang Dental Implants trong Figma có hai section "Treatment options and costs" giống hệt nhau, đã chỉ dựng một.
- **Dữ liệu mẫu từ thiết kế, không phải sự thật kinh doanh:** 5 thẻ dịch vụ giống nhau, giá "600$" / "$600" / "C$1,250 · 40 clinics", bảng so sánh giá, số liệu "30,000+ khách…", "4.9/5 Google Reviews", "20+ countries", thông tin bác sĩ, địa chỉ chi nhánh. Chủ dự án phải xác nhận hoặc thay trước khi lên production. Ảnh có người thật (before/after), ảnh X-quang, ảnh có chữ quảng cáo tiếng Việt in sẵn cần xác nhận quyền sử dụng.
- Chỗ tạm cần thay: route đánh dấu `PROVISIONAL` trong `src/data/*.ts` (chỉ 7 trang trên tồn tại, các link còn lại như `/travel-guide`, `/dental-knowledge` hiện 404), URL mạng xã hội (`href="#"`), nút "Watch video"/"View all videos" (chưa có video), danh sách dịch vụ trong form, câu trả lời FAQ và phần phương pháp ở bảng giá (Figma chỉ có câu hỏi). Logo là PNG 370px, cần bản vector. Form POST tới `/api/consultation` chưa tồn tại (giai đoạn 4).
- Lỗi chính tả trong Figma ("consulation", "View all doctor") đã được sửa trong code.
- Font serif **chưa được Figma ghi tên**. Chọn Cormorant Garamond 600 vì độ rộng chữ khớp (dòng "Every Perfect Journey" đều rộng 509px). Cần chủ dự án xác nhận. Màu hex là giá trị đo từ swatch, sai số hiển thị rất nhỏ.
- Số liệu Figma đã đọc: hero 60/66, h2 42/48, h3 23/31, body 16/26, small 14/22, button 14/20, label Inter 600 12/18 tracking 12%. Container 1200, lề 120, utility bar 38, header 88, nút cao 48 radius 8.
- `WEBSITE_STYLE_GUIDE.md` được nhắc trong tài liệu nhưng **chưa tồn tại** trong workspace. Không bịa nội dung style guide.
- Figma là nguồn thiết kế chính: https://www.figma.com/design/wzMnrBvsmXVyfYIGmi0J7L/Untitled?node-id=0-1. Đã đọc được file qua tiện ích Chrome (cần mở sẵn Figma đã đăng nhập). Page 1 có 8 frame desktop 1440px: Refined / Home, About, Services, Dental Implants, Our Doctors, Dental Packages (2 frame: Single Treatments, Travel Combos), cùng component dùng chung (Shared Header, Footer, Consultation, Social; Doctor Profile, Treatment/Benefit/Package Price/Destination/Journey/Doctor/Location/Service Card, Form Field, Button Primary/Outline). Chưa thấy frame mobile và các trạng thái tương tác. Còn thiếu trang Travel Guide/Destinations riêng nếu cần.
- **Khi đọc Figma qua Chrome (Free plan, không có Dev Mode):** chọn layer rồi `shift+2` để zoom; `cmd+click` để chọn sâu vào lớp chữ; panel Typography hiện `tên style size/line-height`. **Không bấm nút `</>` cạnh tên layer** (đó là "Mark as ready for dev", sẽ sửa file của chủ dự án; từng bấm nhầm và đã gỡ bằng "Remove status"). Đừng bấm Tab trong khi đang chọn layer (focus nhảy vào ô tên file). Đừng bấm icon thu gọn cạnh "Layers" (ẩn cả panel layer). Luôn chụp màn hình trước khi bấm ở vùng panel trái: sau khi đóng ô tìm kiếm layer, nút "+" (thêm trang) nằm đúng chỗ nút X cũ (từng tạo nhầm "Page 2", đã xóa). Gõ chữ khi ô tìm kiếm chưa focus sẽ kích hoạt phím tắt công cụ của Figma. Export ảnh: chọn nhiều layer (Cmd+Shift+click), thêm Export 2x, tải zip về `~/Downloads`, rồi **gỡ cấu hình export** khỏi layer.
- Cập nhật mục này khi có repo, lệnh build/test, hoặc tài liệu thiết kế mới.

## Lệnh thường dùng

Node theo `.nvmrc` (22.22.0; Astro 7 cần ≥ 22.12). Dùng `fnm use`.

- `npm run dev`: dev server Astro.
- `npm run preview`: build rồi chạy Worker cục bộ bằng `wrangler dev` (gần production nhất, dùng để kiểm route động).
- `npm run check`: `wrangler types` + `astro check`. `npm run lint`, `npm run format:check`, `npm run build`.
- `npm run deploy:staging` / `deploy:production`: build + `wrangler deploy`. Cần `wrangler login` và tài khoản Cloudflare. Chưa chạy lần nào.
- Sau khi sửa `wrangler.jsonc` phải chạy `npm run typegen`. `worker-configuration.d.ts` được sinh ra và bị gitignore.
- Database local (cần Docker): `npm run db:start`, `db:reset`, `db:test`, `db:lint`, `db:types`, `db:stop`. Chi tiết và quy tắc viết migration ở `supabase/README.md`. Sau khi đổi schema phải chạy lại `db:types` và commit file sinh ra.
- Secret local: copy `.dev.vars.example` thành `.dev.vars` (không commit).

Đã chủ động tắt `session` (không dùng KV) và image binding lúc runtime trong `astro.config.mjs` để tránh tạo tài nguyên Cloudflare ngoài ý muốn. Bật lại chỉ khi có lý do.

`npm audit` báo 5 lỗ hổng mức high, đều ở dev dependency (`eslint-plugin-astro` → `braces`), 0 lỗ hổng ở dependency production. Kiểm tra lại khi nâng phiên bản.

## Quyết định đã chốt (không tự đổi)

| Hạng mục          | Quyết định                                |
| ----------------- | ----------------------------------------- |
| Frontend          | Astro + TypeScript                        |
| Database / Auth   | Supabase (PostgreSQL, Auth, RLS)          |
| Hạ tầng, API, CDN | Cloudflare (Workers + Static Assets)      |
| Media             | Cloudflare R2                             |
| CMS               | Tự xây, trong `/admin` của ứng dụng Astro |
| Hiệu năng         | Tải nhanh, phục vụ traffic quốc tế        |
| UI                | Bám Figma                                 |

## Ngoài phạm vi (không thêm)

- Stripe, checkout, thanh toán.
- Cloudflare Stream, HLS/DASH, livestream, transcoding video. Video giới thiệu nếu có chỉ là file MP4 trên R2, hiển thị poster trước và tải khi cần xem.
- Tài khoản khách hàng, booking theo slot, hồ sơ bệnh án, upload ảnh chẩn đoán.
- Page builder kéo thả tự do. CMS chỉ chỉnh nội dung và tuỳ chọn bố cục giới hạn trên component Astro có sẵn.

## Nguyên tắc kiến trúc

- **Trang public dựng sẵn lúc build**, lấy nội dung đã xuất bản từ Supabase. Không truy vấn DB cho mỗi lượt xem trang. Nội dung và SEO phải có trong HTML ban đầu.
- Static assets phục vụ trực tiếp, không đi qua Worker (tránh tốn quota request động).
- JavaScript tối thiểu. Không thêm React hay framework UI cho trang public. CMS/editor không được làm tăng bundle trang public.
- Route động (form, auth, preview, admin API) chạy trên Workers qua Astro endpoints. Các route có dữ liệu cá nhân, preview hoặc yêu cầu đăng nhập **không** cache công khai.
- Không giả định thư viện Node.js nào cũng chạy được trên Workers. Kiểm tra trước khi thêm dependency.
- Pin phiên bản sau khi kiểm tra tương thích Astro, adapter Cloudflare và Workers. Không sao chép cấu hình runtime cũ một cách máy móc.

## Quy trình xuất bản CMS

draft → queued → building → deployed / failed.

- Draft không làm thay đổi nội dung public.
- Build đọc **snapshot** (`content_revisions`), không đọc dữ liệu đang sửa dở.
- Phân biệt "đã duyệt xuất bản" và "đã deploy thực sự".
- Build lỗi thì tiếp tục phục vụ bản deploy trước.
- Gộp/xếp hàng các lần Publish gần nhau. Không chạy build nặng trong request Worker.
- Build hook là secret, chỉ ở backend.

## Dữ liệu và bảo mật

- Schema quản lý bằng migration lưu trong repo (`supabase/migrations`), **không sửa migration đã đẩy lên project thật**, sai thì viết migration mới. Bảng nội dung là bản làm việc; Publish chép vào `content_revisions` bất biến và build chỉ đọc snapshot. Bảng mới phải bật RLS + policy admin + có test (test `rls.test.sql` fail nếu có bảng `public` thiếu RLS). `anon` không có quyền trên bảng nào. Không copy dữ liệu cá nhân vào `audit_logs`.
- Bảng quan hệ cho thực thể có cấu trúc. JSONB chỉ cho nội dung section có schema rõ ràng, kèm validation và version schema.
- Bật RLS, kiểm tra quyền phía server cho mọi thao tác quản trị. Không tin role do client khai báo.
- `service_role` / secret key, R2 credentials, build hook chỉ ở backend hoặc CI secret. Không commit, không đưa ra browser.
- **Chỉ có một vai trò: `admin`** (chủ dự án chốt 2026-10-05). Không có `editor`, không có quyền Publish riêng: mọi admin được sửa nội dung, publish và xem yêu cầu tư vấn. RLS chỉ cần phân biệt admin với người còn lại. Khi cần thêm vai trò thì thêm sau bằng migration, đừng thiết kế sẵn.
- Tách local / staging / production. Staging không ghi vào dữ liệu production.
- `noindex` cho admin và preview, nhưng không thay thế xác thực.
- Log không ghi thông tin cá nhân.

## Form tư vấn

Luồng: Workers API validate → lưu Supabase → admin xem trong `/admin`. **Không gửi email thông báo** (chủ dự án chốt 2026-10-05): không tích hợp nhà cung cấp email, không hàng đợi retry email.

- Chỉ trả thành công khi đã lưu được vào DB. Không có kênh thông báo nên admin phải thấy rõ yêu cầu mới (số lượng chưa xử lý trong `/admin`).
- Validation phía server, giới hạn kích thước request, rate limit, Turnstile khi cần.
- Chỉ hỏi các field có trong Figma và thực sự cần cho tư vấn.

## Media

- R2 lưu file, Supabase lưu metadata. Phục vụ qua custom domain của R2 với Cloudflare Cache.
- R2 không tự tạo biến thể ảnh. Cần pipeline lúc upload hoặc build. Ưu tiên WebP/AVIF, `srcset`/`sizes`, khai báo kích thước ảnh.
- Hero ưu tiên tải, ảnh bên dưới lazy-load. Object key có phiên bản để tránh cache ảnh cũ.
- Font WOFF2, chỉ tải family/weight cần dùng.
- Chat widget, bản đồ, video embed và script bên thứ ba tải sau nội dung chính.

## UI

- Đối chiếu Figma trước khi xây component. Nếu Figma và style guide khác nhau, ghi nhận và hỏi trước khi quyết định.
- Design tokens (màu, font, spacing) tập trung một chỗ. Tái sử dụng header, footer, button, card, form.
- Tự bổ sung responsive mobile/tablet và các trạng thái tương tác khi Figma thiếu, nhưng nói rõ phần nào là tự bổ sung.
- **Không tự bịa** giá, chứng nhận, đánh giá, thành tích bác sĩ hoặc thông tin kinh doanh. Dùng placeholder rõ ràng cho dữ liệu chưa có.
- **Không đa ngôn ngữ** (chủ dự án chốt 2026-10-05): site chỉ tiếng Anh. Không thêm i18n/routing theo locale, không cột ngôn ngữ trong schema. Nội dung tiếng Việt trong Figma (ví dụ "Chi phí thấp hơn…") là dữ liệu mẫu, không phải bản dịch.

## Mục tiêu hiệu năng

LCP ≤ 2,5s, INP ≤ 200ms, CLS ≤ 0,1 (phân vị 75, tách mobile/desktop). Đây là mục tiêu, chưa phải kết quả đã đo. Khi đo, so sánh cache hit với cache miss. Không cam kết dựa trên một kết quả cache hit.

## Thông tin còn thiếu

Dùng placeholder, không tự điền:

- Danh sách trang đầy đủ, Figma Home và mobile.
- Domain, tài khoản Cloudflare, quyền deploy. Project Supabase đã tạo (ref `npbiucxxcnppgecmkhdz`), region "asia" chưa rõ chính xác.
- Region database, thị trường ưu tiên.
- Số lượng và dung lượng video, nhu cầu cập nhật nội dung tức thời.
- Traffic dự kiến, ngân sách vận hành.

## Cách làm việc

- Trả lời và viết tài liệu bằng tiếng Việt. Code, tên biến, commit message dùng tiếng Anh.
- Trước khi viết code: đọc CLAUDE.md và WEBSITE_TECHSTACK.md, kiểm tra hiện trạng workspace, đối chiếu Figma.
- Thứ tự triển khai: Astro + Cloudflare skeleton → tokens/component → UI public → schema Supabase + RLS → form tư vấn → CMS + media → quy trình publish → nghiệm thu hiệu năng/bảo mật.
- Các chi tiết trong WEBSITE_TECHSTACK.md ngoài mục "đã chốt" là đề xuất. Đánh giá theo code và yêu cầu thực tế, không coi là bắt buộc.
