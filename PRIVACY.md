# Better Canvas privacy policy

Last updated: October 28, 2026

Better Canvas is a browser extension for Instructure Canvas. It has no servers, no accounts and no analytics. The developer doesn't receive any of your data.

## What it reads from Canvas

On Canvas pages, Better Canvas reads the page and calls your school's Canvas API with the login you already have. It reads your courses, grades, assignments, rubrics, modules, files, announcements, discussions and planner items. On classic discussion pages it reads the course's teacher and TA records to mark instructor posts. In courses where you teach, instructor tools also read the student roster for CSV export. It uses these to draw its dashboard, planner, grade tools and reminders. These requests go only to your school's Canvas site.

## What it saves in Canvas

Tasks you add through the planner, the right-click "add this as a task" item or the syllabus scanner are saved in Canvas as planner notes. The syllabus scanner sends the title, date and course you pick. Canvas stores these notes, not Better Canvas. Marking a Canvas planner item done updates Canvas. Done marks on recurring tasks stay in your browser.

## What it stores in your browser

Everything else stays in your browser's local extension storage on your device:

- settings and saved themes
- planner data such as recurring tasks, tags, stars, snoozes, streaks, task notes and subtasks
- a record of syllabus dates you added to the planner, with their titles
- your school's navigation labels, cached so the sidebar settings can list them
- sticky notes and text drafts, stored with the Canvas page address they belong to
- quiz answer backups. A normal quiz submit clears them, but a timed quiz that submits itself can leave one behind. Saving a backup trims the list to ten. When the quiz saver runs on a classic quiz page, it removes backups older than seven days, so a backup can stay longer if the saver doesn't run.
- study time per course, focus sessions, reminder history, grade history and rubric estimates
- for instructors, attendance marks
- if you connect ChatGPT, your ChatGPT email, the model you picked and the sign-in tokens. These sit in the extension's own database, which Canvas pages and the extension's page scripts can't read, and backups don't include them. Disconnect signs Better Canvas out at OpenAI and deletes the tokens.

You can export and import this data from the extension's settings. Reset puts the options back to their defaults and keeps your saved work. Uninstalling the extension deletes its local storage. It doesn't delete planner notes in Canvas or files you exported.

## What leaves your device

- Canvas requests go to your school's Canvas site.
- When you browse online themes, your search words, or a default category search, go to the Openverse API (api.openverse.org).
- Theme images load from the sites that host them, such as Flickr and Rawpixel. Those sites see a normal image request from your browser.
- If you add an image by URL, the extension downloads it from that address.
- To tint your school's logo, the extension loads the logo image from wherever your school hosts it.
- The live preview in the settings copies the current Canvas page. It may request that page's images, stylesheets, fonts, audio and video again from the same places.
- Custom CSS, including CSS in an imported theme, can load images, fonts or stylesheets from the addresses it links to.
- When you use Speak, Canvas text goes to your browser's speech engine. Depending on the voice, that engine may process speech online.
- If you connect ChatGPT under Settings, ChatGPT, sign-in happens on OpenAI's own page (auth.openai.com) in a new tab. OpenAI then sends the tab to a 127.0.0.1 address, which is your own computer, and Better Canvas reads the sign-in code from it. Requests that use your ChatGPT plan go from your browser to api.openai.com. Today that is the model list and the Test message. Better Canvas never sees your ChatGPT password and can't read your ChatGPT conversations.

Better Canvas doesn't sell data or show ads. Its features only send requests and text to the places listed above.

## Instructor tools

In courses where you teach, you can export the roster, with names, emails and SIS IDs, to a CSV file. The file is saved on your computer and goes nowhere else.

## Contact

Open an issue at https://github.com/Alitleis123/Better-Canvas/issues.
