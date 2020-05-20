const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const mkdirp = require("mkdirp");
const minify = require("html-minifier").minify;
const showdown = require("showdown");
const fsExtra = require("fs-extra");

const BUILD_DIR = require("./build-config").BUILD_DIR;

const readPostConfigFromFile = (postDirectoryName, rootDirectoryName) => {
  const configFilePath = path.join(
    __dirname,
    rootDirectoryName,
    postDirectoryName,
    "config.json"
  );
  return JSON.parse(fs.readFileSync(configFilePath, "utf8"));
};

const getCanonicalPostUrl = (websiteConfig, postConfig) =>
  `${websiteConfig.url}${path.join(postConfig.slug, "/")}`;

const readWebsiteConfigFromFile = () => {
  const configFilePath = path.join(__dirname, "./website-config.json");
  return JSON.parse(fs.readFileSync(configFilePath, "utf8"));
};

const getListOfDirectoriesInDataDirectory = (rootDirectoryName) => {
  const dataDirectoryPath = path.join(__dirname, rootDirectoryName);
  const fileNames = fs.readdirSync(dataDirectoryPath, "utf8");
  const directoryNames = fileNames.filter((fileName) =>
    fs.statSync(path.join(dataDirectoryPath, fileName)).isDirectory()
  );

  return directoryNames;
};

const getListOfPostsInDataDirectory = (rootDirectoryName) => {
  const dataDirectoryPath = path.join(__dirname, "data");
  const fileNames = fs.readdirSync(dataDirectoryPath, "utf8");
  const posts = fileNames
    .filter((fileName) =>
      fs.statSync(path.join(dataDirectoryPath, fileName)).isDirectory()
    )
    .map((post) => readPostConfigFromFile(post, rootDirectoryName))
    .sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);

      if (dateA < dateB) {
        return 1;
      }

      if (dateA > dateB) {
        return -1;
      }

      return 0;
    });

  return posts;
};

const convertMarkdownToHtml = (markdown) => {
  const converter = new showdown.Converter({
    noHeaderId: true,
  });

  return converter.makeHtml(markdown);
};

const readMarkdownFromFile = (markdownFilePath) =>
  fs.readFileSync(markdownFilePath, "utf8");

const getPostBuildDirectoryPath = (postConfig) =>
  path.join(__dirname, BUILD_DIR, postConfig.slug);

const createPostHtmlFile = (postHtmlContent, postConfig) => {
  const directoryPath = getPostBuildDirectoryPath(postConfig);
  const htmlFilePath = path.join(
    __dirname,
    BUILD_DIR,
    postConfig.slug,
    "index.html"
  );

  mkdirp.sync(directoryPath);

  // https://github.com/mde/ejs/issues/124
  const templateFilePath = path.join(
    __dirname,
    "source/templates/post/index.ejs"
  );

  const compiled = ejs.compile(fs.readFileSync(templateFilePath, "utf8"), {
    filename: templateFilePath,
  });

  const websiteConfig = readWebsiteConfigFromFile();

  let htmlContent = compiled({
    websiteName: websiteConfig.name,
    websiteDescription: websiteConfig.description,
    showHomeLink: true,
    postHtml: postHtmlContent,
    postTitle: postConfig.title,
    postDescription: postConfig.description,
    postSlug: postConfig.slug,
    googleAnalyticsTrackingId: websiteConfig.googleAnalyticsTrackingId,
    addThisPubId: websiteConfig.addThisPubId,
    canonicalPostUrl: getCanonicalPostUrl(websiteConfig, postConfig),
  });

  htmlContent = minify(htmlContent, {
    collapseWhitespace: true,
  });

  fs.writeFileSync(htmlFilePath, htmlContent);
};

const copyPostImagesToBuild = (postConfig, rootDirectoryName) => {
  const postImagesDirectory = path.join(
    __dirname,
    rootDirectoryName,
    postConfig.slug,
    "images"
  );

  fs.stat(postImagesDirectory, (error) => {
    if (!error) {
      const buildPostImagesDirectory = path.join(
        getPostBuildDirectoryPath(postConfig),
        "images/"
      );
      fsExtra.copySync(postImagesDirectory, buildPostImagesDirectory);
    }
  });
};

const copyPostFilesToBuild = (postConfig, rootDirectoryName) => {
  const postImagesDirectory = path.join(
    __dirname,
    rootDirectoryName,
    postConfig.slug,
    "files"
  );

  fs.stat(postImagesDirectory, (error) => {
    if (!error) {
      const buildPostImagesDirectory = path.join(
        getPostBuildDirectoryPath(postConfig),
        "files/"
      );
      fsExtra.copySync(postImagesDirectory, buildPostImagesDirectory);
    }
  });
};

function transformPostHtml(postHtml) {
  return postHtml
    .replace(/<h1>/g, '<div class="col-sm-8 offset-sm-2"><h1>')
    .replace(/<\/h1>/g, "</h1></div>")
    .replace(/<h2>/g, '<div class="col-sm-8 offset-sm-2"><h2>')
    .replace(/<\/h2>/g, "</h2></div>")
    .replace(/<h3>/g, '<div class="col-sm-8 offset-sm-2"><h3>')
    .replace(/<\/h3>/g, "</h3></div>")
    .replace(/<p>/g, '<div class="col-sm-6 offset-sm-3"><p>')
    .replace(/<\/p>/g, "</p></div>")
    .replace(/<figure/g, '<div class="col-sm-12"><figure')
    .replace(/<\/figure>/g, "</figure></div>")
    .replace(/<hr \/>/g, '<div class="col-sm-8 offset-sm-2"><hr /></div>');
}

const createPost = (postDirectoryName, rootDirectoryName) => {
  const postConfig = readPostConfigFromFile(
    postDirectoryName,
    rootDirectoryName
  );
  const contentFilePath = path.join(
    __dirname,
    rootDirectoryName,
    postConfig.slug,
    "content.md"
  );
  const postMarkdown = readMarkdownFromFile(contentFilePath);
  const postHtml = transformPostHtml(convertMarkdownToHtml(postMarkdown));

  console.log(`💡 Creating: ${postConfig.title}`); // eslint-disable-line no-console

  createPostHtmlFile(postHtml, postConfig);
  copyPostImagesToBuild(postConfig, rootDirectoryName);
  copyPostFilesToBuild(postConfig, rootDirectoryName);
};

const createPosts = (rootDirectoryName) =>
  getListOfDirectoriesInDataDirectory(rootDirectoryName).forEach((directory) =>
    createPost(directory, rootDirectoryName)
  );

const createHomePage = (rootDirectoryName) => {
  const htmlFilePath = path.join(__dirname, `${BUILD_DIR}/index.html`);

  // https://github.com/mde/ejs/issues/124
  const templateFilePath = path.join(
    __dirname,
    "source/templates/home/index.ejs"
  );

  const compiled = ejs.compile(fs.readFileSync(templateFilePath, "utf8"), {
    filename: templateFilePath,
  });

  const posts = getListOfPostsInDataDirectory(rootDirectoryName);

  const websiteConfig = readWebsiteConfigFromFile();

  let htmlContent = compiled({
    websiteName: websiteConfig.name,
    websiteDescription: websiteConfig.description,
    posts,
    showHomeLink: false,
    googleAnalyticsTrackingId: websiteConfig.googleAnalyticsTrackingId,
  });

  htmlContent = minify(htmlContent, {
    collapseWhitespace: true,
  });

  fs.writeFileSync(htmlFilePath, htmlContent);
};

createPosts("data");
createPosts("pages");
createHomePage("data");

console.log("🏁  Finished."); // eslint-disable-line no-console
