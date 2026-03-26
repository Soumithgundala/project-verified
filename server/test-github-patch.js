const axios = require('axios');
async function test() {
  try {
    const res = await axios.get('https://api.github.com/repos/facebook/react/commits/master');
    console.log(JSON.stringify(res.data.files[0].patch));
  } catch (e) {
    console.error(e.message);
  }
}
test();
