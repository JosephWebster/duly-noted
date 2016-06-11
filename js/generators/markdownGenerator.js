"use strict";
var referenceCollection_1 = require("../classes/referenceCollection");
var referenceParser_1 = require("../modules/referenceParser");
var node_dir_1 = require("node-dir");
var XRegExp = require("xregexp");
var fs_1 = require("fs");
var mkdirp = require("mkdirp");
var path = require("path");
var _ = require("underscore");
var lineReader = require("line-reader");
var log4js = require("log4js");
var logger = log4js.getLogger("duly-noted::MarkdownGenerator");
var MarkdownGenerator = (function () {
    function MarkdownGenerator(config, logLevel) {
        this.tags = [];
        this.outputFiles = [];
        logger.setLevel(logLevel || "DEBUG");
        this.outputDir = config.outputDir;
        this.externalReferences = JSON.parse(fs_1.readFileSync(path.join(referenceParser_1.parseLoc, "externalReferences.json")).toString());
        this.anchorRegExp = new RegExp(config.anchorRegExp);
        this.linkRegExp = new RegExp(config.linkRegExp);
        this.referenceCollection = new referenceCollection_1.ReferenceCollection("").inflate(JSON.parse(fs_1.readFileSync(path.join(referenceParser_1.parseLoc, "internalReferences.json")).toString()));
        this.tags = this.referenceCollection.getAllTags();
        this.readme = config.readme;
        this.projectName = config.projectName;
    }
    MarkdownGenerator.prototype.generate = function () {
        logger.info("Generating Markdown Docs.");
        var that = this;
        this.outputFiles = [];
        node_dir_1.readFiles(referenceParser_1.parseLoc, { match: /.json$/, exclude: /internalReferences.json|externalReferences.json/, recursive: true }, function (err, content, next) {
            that.proccessFile(err, content, next, that.outputDir);
        }, function (err, files) {
            var readme = "";
            var i = 1;
            lineReader.eachLine(that.readme, function (line, last) {
                var newLine = line;
                newLine = that.replaceExternalLinks(newLine, that.readme, i);
                newLine = that.replaceInternalLinks(newLine, that.readme, i);
                readme += "\n" + newLine;
                i++;
            }, function () {
                that.generateIndexPage(readme);
            });
        });
    };
    MarkdownGenerator.prototype.proccessFile = function (err, content, next, outputDir) {
        var file = JSON.parse(content);
        var that = this;
        logger.debug("Processing " + file.name);
        if (err) {
            logger.error(err.message);
        }
        else {
            var file_1 = JSON.parse(content);
            var output_1 = "";
            var inCodeBlock = false;
            for (var i = 0; i < file_1.lines.length; i++) {
                if (typeof (file_1.lines[i].comment) === "string" && file_1.lines[i].comment !== "" && file_1.lines[i].comment !== null) {
                    file_1.lines[i].comment = this.replaceAnchors(file_1.lines[i].comment, file_1.name, i);
                    file_1.lines[i].comment = this.replaceExternalLinks(file_1.lines[i].comment, file_1.name, i);
                    file_1.lines[i].comment = this.replaceInternalLinks(file_1.lines[i].comment, file_1.name, i);
                }
            }
            for (var i = 0; i < file_1.lines.length; i++) {
                if (typeof (file_1.lines[i].comment) === "string" && file_1.lines[i].comment !== "" && file_1.lines[i].comment !== null) {
                    if (inCodeBlock) {
                        output_1 += "```" + "\n";
                        inCodeBlock = false;
                    }
                    output_1 += file_1.lines[i].comment + "\n" + "\n";
                }
                if (typeof (file_1.lines[i].code) === "string" && file_1.lines[i].code !== "" && file_1.lines[i].code !== null) {
                    if (!inCodeBlock) {
                        output_1 += "```" + file_1.type + "\n";
                        inCodeBlock = true;
                    }
                    output_1 += file_1.lines[i].code + "\n";
                }
            }
            if (inCodeBlock) {
                output_1 += "```" + "\n";
                inCodeBlock = false;
            }
            var filePathArray = path.join(outputDir, file_1.name + ".md").split("/");
            filePathArray.pop();
            var filePath = filePathArray.join("/");
            mkdirp(filePath, function (err) {
                if (err) {
                    logger.fatal(err.message);
                }
                else {
                    var fileName = path.join(outputDir, file_1.name + ".md");
                    that.outputFiles.push(fileName);
                    logger.debug("Saving output for " + file_1.type + " file " + file_1.name + " as " + fileName);
                    fs_1.writeFileSync(fileName, output_1, { flag: "w" });
                }
            });
            next();
        }
    };
    MarkdownGenerator.prototype.replaceAnchors = function (comment, fileName, line) {
        var pos = 0;
        var match;
        var newComment = comment;
        while (match = XRegExp.exec(newComment, this.anchorRegExp, pos, false)) {
            newComment = newComment.substr(0, match.index) +
                "[" + match[1] + "](#" + match[1] + ")" +
                newComment.substr(match.index + match[0].length);
            pos = match.index + match[0].length;
        }
        return newComment;
    };
    MarkdownGenerator.prototype.replaceInternalLinks = function (comment, fileName, line) {
        var pos = 0;
        var match;
        var newComment = comment;
        var linkPrefix = this.getLinkPrefix(fileName);
        while (match = XRegExp.exec(newComment, this.linkRegExp, pos, false)) {
            var tag = _.findWhere(this.tags, { anchor: match[1] });
            if (!tag) {
                logger.warn("link: " + match[1] + " in " + fileName + ":" + line + " does not have a cooresponding anchor, so link cannot be created.");
            }
            else {
                logger.debug("found internal link: " + match[1]);
                newComment = comment.substr(0, match.index) +
                    " [" + match[1] + "](" + linkPrefix + tag.path + ".md#" + match[1] + ") " +
                    newComment.substr(match.index + match[0].length);
            }
            pos = match.index + match[0].length;
        }
        return newComment;
    };
    MarkdownGenerator.prototype.replaceExternalLinks = function (comment, fileName, line) {
        var pos = 0;
        var match;
        var newComment = comment;
        while (match = XRegExp.exec(newComment, this.linkRegExp, pos, false)) {
            var tagArray = match[1].split("/");
            var tag = _.findWhere(this.externalReferences, { anchor: tagArray[0] });
            if (tag) {
                logger.debug("found external link: " + match[1]);
                for (var i = 1; i < tagArray.length; i++) {
                    tag.path = tag.path.replace("::", tagArray[i]);
                }
                newComment = comment.substr(0, match.index - 1) +
                    " [" + match[1] + "](" + tag.path + ") " +
                    newComment.substr(match.index + match[0].length);
            }
            pos = match.index + match[0].length;
        }
        return newComment;
    };
    MarkdownGenerator.prototype.generateIndexPage = function (readmeText) {
        logger.info("generating Duly Noted.md");
        var that = this;
        var outputMap = {
            project: this.projectName,
            collections: [],
            files: this.outputFiles,
            readme: readmeText
        };
        var collections = that.referenceCollection.getTagsByCollection();
        for (var i = 0; i < collections.length; i++) {
            var anchors = _.clone(collections[i].anchors);
            for (var x = 0; x < anchors.length; x++) {
                var linkPrefix = that.getLinkPrefix(anchors[x].path);
                anchors[x].path = anchors[x].path + ".md#" + anchors[x].linkStub;
            }
            var name_1 = collections[i].name.split("/");
            name_1.shift();
            name_1.shift();
            name_1 = name_1.join("/");
            outputMap.collections.push({
                name: name_1,
                anchors: anchors
            });
        }
        var md = "# " + this.projectName + " documentation \n";
        md += "### Collections \n";
        for (var i = 0; i < outputMap.collections.length; i++) {
            md += "\n#### " + outputMap.collections[i].name + " \n";
            for (var x = 0; x < outputMap.collections[i].anchors.length; x++) {
                md += "* [" + outputMap.collections[i].anchors[x].anchor + "]" + "(" + outputMap.collections[i].anchors[x].path + ") \n";
            }
        }
        md += "\n------------------------------ \n";
        md += "\n### Files \n";
        for (var i = 0; i < outputMap.files.length; i++) {
            md += "* [" + outputMap.files[i] + "](" + outputMap.files[i] + ") \n";
        }
        md += "\n------------------------------ \n";
        md += outputMap.readme;
        fs_1.writeFileSync(path.join(that.outputDir, "Duly Noted.md"), md, { flag: "w" });
    };
    MarkdownGenerator.prototype.getLinkPrefix = function (fileName) {
        var fileNameAsArray = fileName.split("/");
        var linkPrefix = "";
        for (var i = 0; i < fileNameAsArray.length - 2; i++) {
            linkPrefix += "../";
        }
        return linkPrefix;
    };
    return MarkdownGenerator;
}());
exports.MarkdownGenerator = MarkdownGenerator;