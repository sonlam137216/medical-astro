# CLAUDE.md — Melatec

Website giới thiệu dịch vụ nha khoa kết hợp hỗ trợ khách quốc tế đến Việt Nam. Thiên về nội dung, hình ảnh, thông tin bác sĩ, gói dịch vụ và tiếp nhận yêu cầu tư vấn.

Tài liệu gốc: [WEBSITE_TECHSTACK.md](./WEBSITE_TECHSTACK.md) (tiếng Việt). Đọc file đó trước khi quyết định kiến trúc. File này chỉ tóm tắt các quy tắc cần nhớ khi làm việc.

## Trạng thái hiện tại

- **Giai đoạn 1 đã xong:** skeleton Astro 7 + `@astrojs/cloudflare` 14 + Wrangler 4, TypeScript strict. Git repo nhánh `main`. Chưa có remote, chưa deploy (chưa có tài khoản Cloudflare).
- **Giai đoạn 2 (UI public) đã dựng xong ở mức bố cục, còn tinh chỉnh.** 7 trang tĩnh đã có: `/`, `/about`, `/services`, `/services/dental-implants`, `/our-doctors`, `/dental-packages` (frame Single Treatments), `/dental-packages/travel-combos`. Tokens ở `src/styles/tokens.css`, font tự host (Inter variable + Cormorant Garamond 600), component chung ở `src/components` (Header, Footer, Button, Section, SectionIntro, PageHero, CtaBand, ConsultationSection, PlanVisit, SocialBar...), thẻ ở `src/components/cards`, section riêng của Home ở `src/components/home`. Nội dung nằm ở `src/data/*.ts` (thay dần bằng nội dung đã publish từ D1 ở giai đoạn 5). Ảnh nằm ở `src/assets/images` (xem `SOURCES.md` ở đó). Đã kiểm trực quan với Figma ở 1440 và kiểm không tràn ngang ở ~500px; chưa so từng pixel.
- **Giai đoạn 3 (database) đã chuyển từ Supabase sang Cloudflare D1 (2026-10-05, theo yêu cầu chủ dự án). Xong ở mức code và test local. D1 staging `melatec-staging` (id `09e15b8c-…`, vùng APAC) đã tạo và migrate (2026-10-05), CHƯA có admin, CHƯA deploy; D1 production chưa tạo.** Schema ở `db/migrations/0001_init.sql` (gộp 5 migration Postgres cũ; 21 bảng gồm `admins`, `admin_sessions`), dữ liệu mẫu `db/seed.sql` (chỉ local), hướng dẫn đầy đủ ở `db/README.md`. **Quyền hạn không còn do RLS:** D1 không có API công khai, chỉ Worker (binding `DB`) và CI (token Cloudflare qua HTTP API) vào được, nên middleware (`src/middleware.ts`) phải che mọi `/admin/*` và route ngoài `/admin` không được đụng bảng nội dung/yêu cầu tư vấn (trừ `insert` của `/api/consultation`). Lớp truy vấn `src/lib/db.ts` (kiểu bảng và registry ở `src/lib/db-schema.ts`) giữ dáng `from().select().eq()...` để mã cũ ít đổi: đổi 0/1↔boolean, JSON text↔mảng/object, mã lỗi `23505/23503/23514`, JOIN many-to-one, **ghi `audit_logs` cùng batch (nguyên tử)**; mọi tên bảng/cột được kiểm, giá trị luôn là tham số; D1 giới hạn **100 tham số mỗi câu lệnh**. Audit không bao giờ chứa dữ liệu cá nhân (`consultation_requests` chỉ lưu `status`, `source_path`). Ràng buộc còn nguyên bằng CHECK/trigger/partial index: `content_revisions` bất biến, một building + một queued, ảnh đang dùng không xoá được, `site_settings` một dòng (`id = 1`). **Không còn:** RLS, `anon`/`authenticated`/secret key, `src/types/database.ts`, pgTAP, Docker. **Hai database riêng** (`melatec` production, `melatec-staging`; `wrangler.jsonc`: staging đã có id thật, production còn `database_id` toàn số 0 làm chỗ giữ chỗ, deploy production sẽ báo lỗi cho đến khi thay). Project Supabase `npbiucxxcnppgecmkhdz` **không còn được dùng** (chỉ có dữ liệu thử và revision rỗng #1 của staging; không chuyển dữ liệu sang D1); chủ dự án tự quyết định xoá/pause. Các secret `SUPABASE_*` trên staging và GitHub Environment không còn tác dụng, nên xoá. Test mới chạy trên SQLite thật bằng `node:sqlite`; đã thử đầu-cuối trên D1 local (workerd): migration 58 lệnh, đăng nhập, form tư vấn (kể cả gửi trùng), đổi trạng thái, bác sĩ/site/pages/FAQ, Publish, build đọc revision qua API D1 giả. **Cần chủ dự án/bạn làm:** `wrangler d1 create` hai database và điền id, migrate, `npm run admin:create -- <email> --remote`, đặt `D1_DATABASE_ID` và quyền **D1: Edit** cho token trong GitHub Environment (xem `db/README.md`, `PUBLISHING.md`). **Chưa kiểm trên Cloudflare thật:** hành vi PBKDF2 100.000 vòng với giới hạn CPU của Workers (Free chỉ 10 ms CPU mỗi request: thử đăng nhập trên staging trước).
- **Giai đoạn 4 (form tư vấn) đã xong ở mức code, chưa deploy (2026-10-05).** `POST /api/consultation` (`src/pages/api/consultation.ts`, logic validate ở `src/lib/consultation.ts`, ghi qua binding D1 bằng `src/lib/db.ts`): kiểm Origin, rate limit 5 lần/phút/IP bằng binding `CONSULTATION_LIMITER` (`wrangler.jsonc`, theo từng location nên chỉ là phanh chống flood), giới hạn body 8KB, validate server-side, honeypot, chống gửi trùng bằng `submission_id`, ghi bằng binding `DB`, chỉ trả thành công khi đã lưu. Hai form (`ConsultationSection`, `PlanVisit`) dùng chung `FormGuards.astro` và `src/scripts/consultation-form.ts` (gửi tại chỗ khi có JS, vẫn chạy khi không có JS). Đã thử bằng `wrangler dev` + Chrome với DB thật khi còn dùng Supabase. **Chưa làm:** Turnstile (thêm khi thấy spam), trang `/admin` để xem yêu cầu (giai đoạn 6), số lượng yêu cầu chưa xử lý. **Đã thử trên staging Cloudflare** (`https://melatec-website-staging.melatec-website.workers.dev`, đã deploy bằng `npm run deploy:staging`, lúc đó còn dùng Supabase): gửi hợp lệ, gửi trùng, honeypot, body quá lớn, sai origin đều đúng. Lỗi `Network connection lost` chỉ có ở proxy `wrangler dev`, không có ở Cloudflare thật. Rate limit binding chỉ là phanh chống flood: bắn 25 request liên tiếp thì mới có 429 (không phải đúng 5/phút). (Các lần thử trên staging ở đây xảy ra trước khi đổi sang D1; cần thử lại sau khi tạo D1.) Staging nay có database riêng.
- **Giai đoạn 5 (CMS), lát 1 đã xong ở mức code, chưa deploy (2026-10-05): đăng nhập, khung `/admin`, hộp thư yêu cầu tư vấn.** Đăng nhập email+mật khẩu tự xây trên D1 (`src/pages/admin/auth/*`, `src/lib/admin-auth.ts`, `src/lib/password.ts`): băm PBKDF2-SHA256 100.000 vòng bằng Web Crypto (tối thiểu 12 ký tự), session ngẫu nhiên lưu **dạng SHA-256** trong `admin_sessions`, cookie `httpOnly` `mt-session` giới hạn `path=/admin`, sống 7 ngày, đăng xuất xoá hàng session nên cookie bị chép cũng vô hiệu; email không tồn tại vẫn băm một hash giả để không lộ qua thời gian. Tài khoản tạo bằng `npm run admin:create` (không có route đăng ký). **Quyền do middleware quyết định** (xem giai đoạn 3), không còn RLS. Middleware (`src/middleware.ts`) chặn mọi `/admin/*` trừ trang đăng nhập, gắn `no-store`, `noindex`, `x-frame-options: DENY`. Rate limit đăng nhập bằng binding `ADMIN_LOGIN_LIMITER`. Trang: `/admin` (số yêu cầu theo trạng thái), `/admin/consultations` (lọc, phân trang 25), `/admin/consultations/[id]` (đổi trạng thái, ghi chú nội bộ). Huy hiệu số yêu cầu mới trên menu. Không có xoá yêu cầu trong giao diện (dùng trạng thái `spam`). Đã thử với Chrome + DB Supabase thật trước khi đổi sang D1, và lại bằng curl trên D1 local sau khi đổi. **Còn lại của giai đoạn 5:** media R2 (chủ dự án chưa kích hoạt R2), CRUD nội dung từng module và chuyển trang public từ `src/data/*.ts` sang đọc DB lúc build.
- **Giai đoạn 5 (CMS), lát 2 đã xong ở mức code, chưa deploy (2026-10-05): module Bác sĩ + snapshot + build đọc revision.** Admin: `/admin/doctors` (danh sách, thêm, sửa; không có xoá, chỉ ẩn), form xử lý ở `src/lib/doctor-admin.ts` + validate `src/lib/doctors.ts` (trang POST tự hiển thị lại form kèm lỗi và giữ dữ liệu đã gõ). `/admin/publish`: tạo revision bất biến trong `content_revisions` (snapshot dựng bởi `src/lib/snapshot.ts`, hash SHA-256, bỏ qua nếu không đổi) và xếp `publish_jobs` (job đang chờ cũ bị `superseded`). **Build đọc snapshot** qua `src/lib/content.ts` (`getDoctors()` dùng ở Home, About, Our Doctors): lấy revision mới nhất, hoặc đúng `CONTENT_REVISION_ID` nếu đặt; chưa có revision/không có thông tin kết nối thì dùng nội dung mẫu ở `src/data`; lỗi đọc thì **build thất bại** (không âm thầm dùng nội dung cũ). Bác sĩ do CMS quản lý chưa có ảnh nên hiện chữ cái đầu (không gán ảnh chân dung mẫu cho người thật). **Revision là bất biến (trigger chặn UPDATE/DELETE), nên đừng Publish dữ liệu thử lên D1 thật**; thử bằng D1 local (`npm run db:reset`, `db:seed`, `admin:create`, `npm run preview`). Đã thử đầu-cuối trên DB local (Postgres, trước khi đổi sang D1) (19 ca validate, thêm/sửa/trùng slug, publish, build từ revision 12, ẩn đúng bác sĩ ẩn, văn bản được escape). **Chưa làm:** trigger build/deploy tự động và cập nhật trạng thái job (giai đoạn publish), ảnh bác sĩ (R2), các module còn lại (dịch vụ, gói, FAQ, trang/section, menu, cài đặt site, media), liên kết bác sĩ-dịch vụ. Build đọc revision qua API HTTP của D1 (`src/lib/d1-http.ts`, cần `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID` trong `.dev.vars`; thiếu một trong ba thì dùng nội dung mẫu). **Phải đi qua `.dev.vars`**: lúc prerender, `process.env` không thấy được trong workerd.
- **Giai đoạn 5 (CMS), lát 3 đã xong ở mức code, chưa deploy (2026-10-05): media R2.** `/admin/media` (thư viện, upload, sửa mô tả, xoá ảnh không còn được dùng), bộ chọn ảnh trong form Bác sĩ. **Trình duyệt tự tạo các bản WebP** 480/960/1600px (chỉ các cỡ ≤ chiều rộng ảnh gốc, tối thiểu 480px, `src/scripts/media-upload.ts`; việc vẽ lại bằng canvas cũng bỏ EXIF) rồi gửi lên `POST /admin/media/upload`; server **kiểm lại từng file** (`src/lib/media-upload.ts`, `src/lib/webp.ts` đọc kích thước từ header WebP, không tin trình duyệt), ghi R2 qua binding `MEDIA` rồi mới ghi hàng `media_assets` (lỗi thì xoá file). Key: `media/<id>/v<N>/<width>.webp`, bất biến, cache `immutable`. Cột `variant_widths` nay nằm trong `0001_init.sql` của D1. Ảnh phục vụ qua `R2_PUBLIC_BASE_URL` (custom domain trên bucket) nếu có, nếu không thì qua route Worker `/media/*` (dùng cho local và staging, tính vào quota request). Publish bị chặn nếu ảnh trong snapshot không có mô tả và không đánh dấu decorative. Trang public dùng `ProfileImage.astro` (`srcset`, khai báo `width/height`, lazy). Đã thử trên Supabase local + R2 mô phỏng: upload JPEG/PNG, 9 ca bị server từ chối, 3 ca bị từ chối ở trình duyệt, ETag/304, key lạ trả 404, ảnh đang dùng không xoá được, publish rồi build ra `srcset` đúng. **R2 đã kích hoạt, hai bucket `melatec-media` và `melatec-media-staging` đã tạo (2026-10-05); đã deploy staging và thử upload thật trên Cloudflare**: 3 cỡ ảnh vào đúng bucket staging (bucket production không bị động tới), phục vụ qua `/media/*` trên HTTPS với `immutable` + ETag/304, nút Delete xoá cả hàng DB lẫn file R2 (URL trả 404). `wrangler deploy` in cảnh báo về `r2_buckets` ở `env.staging` (so nhầm tên bucket với tên binding), chỉ là cảnh báo, deploy thành công và binding đúng (`env.MEDIA` → `melatec-media-staging`). **Cần chủ dự án:** chọn custom domain cho media (staging tạm đi qua Worker). **Chưa làm:** thay ảnh (tạo phiên bản mới), ảnh/video poster, dọn file R2 mồ côi, nhận diện ảnh của người thật/bệnh nhân (chỉ có cảnh báo trong form), `object-fit` cho ảnh chân dung thật (khung hiện tại giữ kiểu ảnh cắt nền của thiết kế mẫu).
- **Giai đoạn 6 (trigger build), đã xong ở mức code, CHƯA chạy thật trên GitHub (2026-10-05).** Hướng dẫn thiết lập và xử lý sự cố ở `PUBLISHING.md`. Publish lưu revision + job `queued` rồi Worker gọi GitHub API (`workflow_dispatch`, `src/lib/publish.ts`) để chạy `.github/workflows/publish.yml` (concurrency theo môi trường, `environment` = `staging`/`production` giữ secret). Workflow: `scripts/publish-job.mjs start` (nói chuyện với D1 qua API HTTP Cloudflare) (queued→building, dọn job building quá 60 phút) → ghi `.dev.vars` tạm (thông tin D1, `CONTENT_REVISION_ID`) để build đọc revision → `npm run deploy:<env>` → `finish` (deployed) hoặc `fail` (failed). Build lỗi thì không deploy, bản live cũ giữ nguyên. Trang `/admin/publish` hiện bản đang live (từ job `deployed`), nút Build again, liên kết log. Worker cần secret `GITHUB_DISPATCH_TOKEN` (token fine-grained, chỉ quyền Actions) và vars `GITHUB_REPO`, `GITHUB_WORKFLOW`, `PUBLISH_TARGET` trong `wrangler.jsonc`. Đã thử: 17 ca đơn vị của script, 7 kịch bản trên Postgres local (nay thay bằng test chạy trên SQLite thật, `tests/publish-job.test.ts`) (ràng buộc một building/một queued, dọn job treo), Worker với GitHub giả (định dạng request, GitHub từ chối/không kết nối/chưa có token, superseded, retry, busy). **Đã chạy thật trên staging (2026-10-05), khi còn dùng Supabase; sau khi đổi sang D1 cần chạy lại:** Publish bản rỗng (ghi chú 'pipeline test (empty)') tạo revision #1 (**vĩnh viễn, không xoá được**), GitHub nhận `workflow_dispatch` ngay, workflow `success` sau khoảng 1 phút, job `deployed`, log build ghi `building from revision 1`, secret bị che `***`, trang Publish hiện 'Revision 1 is live' kèm liên kết log. Vì revision #1 có danh sách bác sĩ rỗng nên **staging đang không hiện bác sĩ nào** (0 hồ sơ, ẩn mục 'Meet Our Specialists' ở Home) cho đến khi Publish bản thật. CI trên GitHub: lần chạy trước khi sửa `check` fail, sau khi sửa pass. **Sửa hai lỗi mình gây ra:** (1) CI sẽ hỏng ở `npm run check` vì kiểu `Env` sinh từ `.dev.vars` (không có trên GitHub): `typegen` và `check` giờ dùng `wrangler types --env-file .dev.vars.example` (mọi biến môi trường mới phải được thêm vào file mẫu), đã mô phỏng CI không có `.dev.vars` và qua cả 4 bước; (2) `wrangler r2 bucket create` đã tự thêm hai binding lạ (`melatec_media`, `melatec_media_staging`) vào `wrangler.jsonc`, từng bị mình gọi nhầm là cảnh báo vô hại và lọt vào commit `616edf0`; đã xoá, sau khi tạo bucket phải kiểm lại `wrangler.jsonc`.
- **Giai đoạn 5 (CMS), lát A đã xong ở mức code, chưa deploy (2026-10-05): nền tảng CRUD dùng chung + Site details + Menu + Pages (SEO) + Redirects + FAQs.** Nền tảng ở `src/lib/cms/` (`fields.ts` định nghĩa/parse trường, `entities.ts` registry thực thể, `admin.ts` lưu/đọc/xoá, `site.ts`, `pages.ts`), giao diện chung ở `src/pages/admin/content/[entity]/` và `src/components/admin/EntityForm.astro`: **thêm module mới = thêm một mục vào `ENTITIES` + phần snapshot + trang public** (không viết lại form). Menu admin 'Content' nhóm các mục. Site details ở `/admin/site` (một dòng `site_settings`, mạng xã hội lưu dạng JSON nhưng sửa từng nền tảng). Pages (SEO) chỉ sửa tiêu đề/mô tả của 7 trang có sẵn (nút 'Add the website’s pages'), không tạo/đổi địa chỉ. **Snapshot gồm nhiều mục tuỳ chọn** (`site`, `navigation`, `pages`, `doctors`, `faqs`, `redirects`): một mục chỉ vào snapshot khi đã có dữ liệu thật; thiếu thì trang dùng nội dung mẫu ở `src/data` (Publish một mục không làm trống mục khác). Giá trị trống trong Site details nghĩa là 'không cung cấp' nên thành phần ẩn đi, **không bao giờ chèn số điện thoại/email mẫu cạnh dữ liệu thật** (`src/lib/site-content.ts`). **Chặn Publish lên production khi còn mục dùng nội dung mẫu** (site, menu, bác sĩ; `REQUIRED_FOR_PRODUCTION` trong `snapshot.ts`; staging không bị chặn) cùng cảnh báo rằng chữ và số liệu trong từng trang (số bệnh nhân, đánh giá, giá) vẫn cứng trong code. FAQ chưa có đáp án không được publish (đáp án y khoa phải do phòng khám cung cấp). Redirects được build thành `_redirects` (`src/pages/redirects.txt.ts` + `integrations/redirects-file.mjs`, Cloudflare phục vụ ở edge). **Bộ test `npm test` (`node --test`, nay 75 ca, chạy cả trong CI)** cho fields, snapshot, bác sĩ, media/WebP, schema D1, lớp truy vấn, đăng nhập, script job; thư mục `tests` bị loại khỏi tsconfig (không kéo `@types/node`). Đã thử đầu-cuối trên Supabase local (trước khi đổi sang D1; các luồng đã chạy lại trên D1 local): pages/menu/site/redirects/FAQ (cả ca sai), chặn publish production, build ra header/footer/SEO/FAQ/`_redirects` đúng, mục ẩn và FAQ chưa trả lời bị loại, DB thật không bị động tới. **Còn lại của CMS:** Dịch vụ (+liên kết bác sĩ), Gói (+hạng mục), Địa điểm, Điểm đến, Bài viết (Travel Guide, Dental Knowledge), chữ/số liệu trong từng trang (`page_sections`), logo, ảnh chia sẻ, `noindex` theo trang (hiện mọi trang vẫn `noindex` cho đến khi ra mắt).
- **Chưa có trong Figma, tự bổ sung:** toàn bộ responsive mobile/tablet, menu hamburger, trạng thái hover/focus. Trang Dental Implants trong Figma có hai section "Treatment options and costs" giống hệt nhau, đã chỉ dựng một.
- **Dữ liệu mẫu từ thiết kế, không phải sự thật kinh doanh:** 5 thẻ dịch vụ giống nhau, giá "600$" / "$600" / "C$1,250 · 40 clinics", bảng so sánh giá, số liệu "30,000+ khách…", "4.9/5 Google Reviews", "20+ countries", thông tin bác sĩ, địa chỉ chi nhánh. Chủ dự án phải xác nhận hoặc thay trước khi lên production. Ảnh có người thật (before/after), ảnh X-quang, ảnh có chữ quảng cáo tiếng Việt in sẵn cần xác nhận quyền sử dụng.
- Chỗ tạm cần thay: route đánh dấu `PROVISIONAL` trong `src/data/*.ts` (chỉ 7 trang trên tồn tại, các link còn lại như `/travel-guide`, `/dental-knowledge` hiện 404), URL mạng xã hội (`href="#"`), nút "Watch video"/"View all videos" (chưa có video), danh sách dịch vụ trong form, câu trả lời FAQ và phần phương pháp ở bảng giá (Figma chỉ có câu hỏi). Logo là PNG 370px, cần bản vector. Danh sách dịch vụ trong form vẫn lấy từ `footerTreatments` (tạm).
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
- `npm run check`: `wrangler types --env-file .dev.vars.example` + `astro check` (kiểu `Env` lấy từ file mẫu để CI không cần `.dev.vars`). `npm run lint`, `npm run format:check`, `npm run build`.
- `npm run deploy:staging` / `deploy:production`: build + `wrangler deploy`. Cần `wrangler login` và tài khoản Cloudflare. Chưa chạy lần nào.
- Sau khi sửa `wrangler.jsonc` hoặc `.dev.vars.example` phải chạy `npm run typegen`. `worker-configuration.d.ts` được sinh ra và bị gitignore.
- **Trigger trong migration phải viết `BEGIN`/`END;` IN HOA**: `wrangler d1 migrations apply --remote` chỉ nhận dạng chữ hoa, chữ thường báo `incomplete input` (local vẫn chạy được nên không phát hiện sớm).
- Database local (D1 mô phỏng, không cần Docker): `npm run db:migrate`, `db:seed`, `db:reset`, `admin:create -- <email>` (thêm `--remote [--env staging]` cho D1 thật), `db:migrate:staging|production`. `npm test` chạy test trên SQLite trong bộ nhớ (`node:sqlite`, cần Node ≥ 22.13 hoặc cờ `--experimental-sqlite` đã có sẵn trong script). Chi tiết và quy tắc viết migration ở `db/README.md`. Sau khi đổi cột phải cập nhật `src/lib/db-schema.ts` (kiểu và `TABLES`); test `db-schema.test.ts` báo lệch.
- Secret local: copy `.dev.vars.example` thành `.dev.vars` (không commit).

Đã chủ động tắt `session` (không dùng KV) và image binding lúc runtime trong `astro.config.mjs` để tránh tạo tài nguyên Cloudflare ngoài ý muốn. Bật lại chỉ khi có lý do.

`npm audit` báo 5 lỗ hổng mức high, đều ở dev dependency (`eslint-plugin-astro` → `braces`), 0 lỗ hổng ở dependency production. Kiểm tra lại khi nâng phiên bản.

## Quyết định đã chốt (không tự đổi)

| Hạng mục          | Quyết định                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Frontend          | Astro + TypeScript                                                                          |
| Database          | Cloudflare D1 (SQLite) qua binding `DB`; **đổi từ Supabase ngày 2026-10-05 theo chủ dự án** |
| Đăng nhập admin   | Tự xây trên D1 (PBKDF2 + session)                                                           |
| Hạ tầng, API, CDN | Cloudflare (Workers + Static Assets)                                                        |
| Media             | Cloudflare R2                                                                               |
| CMS               | Tự xây, trong `/admin` của ứng dụng Astro                                                   |
| Hiệu năng         | Tải nhanh, phục vụ traffic quốc tế                                                          |
| UI                | Bám Figma                                                                                   |

## Ngoài phạm vi (không thêm)

- Stripe, checkout, thanh toán.
- Cloudflare Stream, HLS/DASH, livestream, transcoding video. Video giới thiệu nếu có chỉ là file MP4 trên R2, hiển thị poster trước và tải khi cần xem.
- Tài khoản khách hàng, booking theo slot, hồ sơ bệnh án, upload ảnh chẩn đoán.
- Page builder kéo thả tự do. CMS chỉ chỉnh nội dung và tuỳ chọn bố cục giới hạn trên component Astro có sẵn.

## Nguyên tắc kiến trúc

- **Trang public dựng sẵn lúc build**, lấy nội dung đã xuất bản từ D1 (API Cloudflare lúc build). Không truy vấn DB cho mỗi lượt xem trang. Nội dung và SEO phải có trong HTML ban đầu.
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

- Schema quản lý bằng migration lưu trong repo (`db/migrations`), **không sửa migration đã áp dụng lên staging/production**, sai thì viết migration mới (`0001_init.sql` chưa áp dụng lên môi trường thật nào). Bảng nội dung là bản làm việc; Publish chép vào `content_revisions` bất biến và build chỉ đọc snapshot. Bảng mới phải có ràng buộc CHECK/FK, khai báo trong `TABLES` (`src/lib/db-schema.ts`) và test. Không copy dữ liệu cá nhân vào `audit_logs` (đặt danh sách cột audit trong `TABLES`).
- Bảng quan hệ cho thực thể có cấu trúc. JSONB chỉ cho nội dung section có schema rõ ràng, kèm validation và version schema.
- **Không có RLS**: quyền chỉ do mã. Mọi route dưới `/admin` đi qua middleware xác thực; route ngoài `/admin` không đụng bảng nội dung hay yêu cầu tư vấn (trừ insert của form). Không tin role do client khai báo.
- Token Cloudflare (có quyền sửa D1), token GitHub, R2 credentials, build hook chỉ ở backend hoặc CI secret. Không commit, không đưa ra browser.
- **Chỉ có một vai trò: `admin`** (chủ dự án chốt 2026-10-05). Không có `editor`, không có quyền Publish riêng: mọi admin được sửa nội dung, publish và xem yêu cầu tư vấn. RLS chỉ cần phân biệt admin với người còn lại. Khi cần thêm vai trò thì thêm sau bằng migration, đừng thiết kế sẵn.
- Tách local / staging / production. Staging không ghi vào dữ liệu production.
- `noindex` cho admin và preview, nhưng không thay thế xác thực.
- Log không ghi thông tin cá nhân.

## Form tư vấn

Luồng: Workers API validate → lưu D1 → admin xem trong `/admin`. **Không gửi email thông báo** (chủ dự án chốt 2026-10-05): không tích hợp nhà cung cấp email, không hàng đợi retry email.

- Chỉ trả thành công khi đã lưu được vào DB. Không có kênh thông báo nên admin phải thấy rõ yêu cầu mới (số lượng chưa xử lý trong `/admin`).
- Validation phía server, giới hạn kích thước request, rate limit, Turnstile khi cần.
- Chỉ hỏi các field có trong Figma và thực sự cần cho tư vấn.

## Media

- R2 lưu file, D1 lưu metadata. Phục vụ qua custom domain của R2 với Cloudflare Cache.
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
- Domain, tài khoản Cloudflare, quyền deploy. D1 `melatec` / `melatec-staging` chưa tạo (xem `db/README.md`); chưa chọn vị trí D1.
- Region database, thị trường ưu tiên.
- Số lượng và dung lượng video, nhu cầu cập nhật nội dung tức thời.
- Traffic dự kiến, ngân sách vận hành.

## Cách làm việc

- Trả lời và viết tài liệu bằng tiếng Việt. Code, tên biến, commit message dùng tiếng Anh.
- Trước khi viết code: đọc CLAUDE.md và WEBSITE_TECHSTACK.md, kiểm tra hiện trạng workspace, đối chiếu Figma.
- Thứ tự triển khai: Astro + Cloudflare skeleton → tokens/component → UI public → schema D1 + đăng nhập admin → form tư vấn → CMS + media → quy trình publish → nghiệm thu hiệu năng/bảo mật.
- Các chi tiết trong WEBSITE_TECHSTACK.md ngoài mục "đã chốt" là đề xuất. Đánh giá theo code và yêu cầu thực tế, không coi là bắt buộc.
