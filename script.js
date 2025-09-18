// Initialize EmailJS
(function() {
    emailjs.init("YOUR_USER_ID"); // Replace with your EmailJS user ID
  })();
  
  const studentSelect = document.getElementById("student-select");
  const forms = document.querySelectorAll(".progress-form");
  const status = document.getElementById("status");
  
  // Map students → EmailJS template IDs
  const studentTemplates = {
    alice: "TEMPLATE_ID_ALICE",
    bob: "TEMPLATE_ID_BOB",
    carol: "TEMPLATE_ID_CAROL"
  };
  
  // Show only the chosen student’s form
  studentSelect.addEventListener("change", function() {
    forms.forEach(f => f.classList.add("hidden"));
    if (this.value) {
      document.getElementById(`progress-form-${this.value}`).classList.remove("hidden");
    }
  });
  
  // Attach submit handlers for each form
  forms.forEach(form => {
    form.addEventListener("submit", function(e) {
      e.preventDefault();
  
      const student = this.id.replace("progress-form-", ""); // e.g. "alice"
      const templateId = studentTemplates[student];
      const message = this.querySelector("textarea").value;
      const selectedClass = this.querySelector("select").value;
  
      emailjs.send("YOUR_SERVICE_ID", templateId, {
        student_name: student.charAt(0).toUpperCase() + student.slice(1),
        class_name: selectedClass,
        message: message
      })
      .then(() => {
        status.textContent = `${student}’s report sent successfully!`;
        this.reset();
      }, (err) => {
        status.textContent = `Failed to send ${student}’s report. Try again.`;
        console.error(err);
      });
    });
  });
  