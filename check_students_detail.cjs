const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.DB_URI;

mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  const batches = await db.collection('batches').find().toArray();
  const students = await db.collection('students').find().toArray();
  const users = await db.collection('users').find().toArray();

  const userMap = {};
  users.forEach(u => {
    userMap[String(u._id)] = u;
  });

  const studentMap = {};
  students.forEach(s => {
    studentMap[String(s._id)] = s;
  });

  for (const b of batches) {
    console.log(`\n========================================`);
    console.log(`BATCH NAME: ${b.name}`);
    console.log(`BATCH ID  : ${b._id}`);
    console.log(`studentIds array in Batch document (${b.studentIds ? b.studentIds.length : 0}):`, b.studentIds);

    const enrolledStudents = students.filter(s => String(s.batchId) === String(b._id) || (b.studentIds && b.studentIds.includes(String(s._id))));
    console.log(`Total Enrolled Students Found: ${enrolledStudents.length}`);
    enrolledStudents.forEach((s, idx) => {
      const user = userMap[String(s.userId)] || {};
      console.log(`  ${idx + 1}. Name: "${user.name || 'N/A'}" | Enrollment: "${s.enrollementNo || s.enrollmentNo || 'N/A'}" | Email: "${user.email || 'N/A'}"`);
    });
  }

  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
