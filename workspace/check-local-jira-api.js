fetch("http://localhost:3000/api/jira/feedback/?keys=TLAPP-24")
  .then(async (response) => {
    const text = await response.text();
    console.log(JSON.stringify({ status: response.status, body: text }, null, 2));
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
