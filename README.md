# TheLearningMatrix
Hub for homeschooling resources. Allows custom reports to be sent on schoolwork progress.

## Local development (Python server)

Run the server **from the TheLearningMatrix directory** (the folder that contains `index.html` and `script.js`). If you run it from a parent folder, the browser may request `script.js` from the wrong path and get a 404 HTML page, which causes “Unexpected token ‘<’” in the console and the login form won’t work.

```bash
cd TheLearningMatrix
python3 -m http.server 8000
```

Then open **http://localhost:8000/** (not a subpath). For login to work, the TubularTutor backend must be running (e.g. `npm start` in the TubularTutor repo on port 3000).

## API expectations (TubularTutor backend)

- **Progress: one value per course per day**  
  When a student submits progress, the frontend sends `courseId`, `percentage`, and `date` (YYYY-MM-DD). The backend should keep only the **latest** value per (student, course, day). If the student submits 90% then 63% for the same course on the same day, only 63% should be stored (replace/upsert by student, course, and date).

- **Progress: admin delete**  
  Admins can delete individual progress entries (e.g. to correct false data). The frontend calls `DELETE /api/admin/students/:studentId/progress/:progressId`. The progress list API (`GET /api/students/:studentId/progress`) must return an `id` for each progress record so the admin UI can target deletes.

## Deployment
- **Frontend:** GitHub Pages (this repo).
- **API:** The backend runs on [Render](https://render.com) (TubularTutor repo). The app calls `https://tubulartutor.onrender.com` when not opened from localhost; for local testing it uses `http://localhost:3000`.
