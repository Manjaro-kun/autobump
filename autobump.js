#!/usr/bin/phantomjs --ssl-protocol=any
"use strict";

var webPage = require('webpage');
var fs = require('fs');
var sys = require('system');


var UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:38.0) Gecko/20100101 Firefox/38.0';
var dvachURL = 'https://2ch.hk';


function MultipartFormData() {
 	this.parts = [];
	return this;
};
MultipartFormData.prototype.addField = function(input, text) {
 	this.parts.push('\r\nContent-Disposition: form-data; name="' + input + '"\r\n\r\n' + text);
};
MultipartFormData.prototype.addFile = function(input, fileName, data) {

 	this.parts.push('\r\nContent-Disposition: form-data; name="' + input + '"; filename="' + fileName + '"\r\nContent-Type: application/octet-stream\r\n\r\n' + data);

};


MultipartFormData.prototype.getData = function() {
	var boundary;
 	while (1) {
 		boundary = /*'---------------------------' +*/ Date.now().toString(10) + Math.round(Math.random() * 1000000).toString(10);
 		for (var i = 0; i < this.parts.length; i++ ) {
 			if (this.parts[i].indexOf(boundary) != -1) {
 				break;
 			}
 		}
 		if (i == this.parts.length) {
 			break;
 		}
 	}
 	this.parts.push('--\r\n');
 	return {data: '--' + boundary + this.parts.join('\r\n' + '--' + boundary), boundary: boundary};
};

/* https://gist.github.com/chrisveness/bcb00eb717e6382c5608 */
function stringToUTF8_BMP(strUni) {
     var strUtf = strUni.replace(
         /[\u0080-\u07ff]/g,  // U+0080 - U+07FF => 2 bytes 110yyyyy, 10zzzzzz
         function(c) {
             var cc = c.charCodeAt(0);
             return String.fromCharCode(0xc0 | cc>>6, 0x80 | cc&0x3f); }
     );
     strUtf = strUtf.replace(
         /[\u0800-\uffff]/g,  // U+0800 - U+FFFF => 3 bytes 1110xxxx, 10yyyyyy, 10zzzzzz
         function(c) {
             var cc = c.charCodeAt(0);
             return String.fromCharCode(0xe0 | cc>>12, 0x80 | cc>>6&0x3F, 0x80 | cc&0x3f); }
     );
     return strUtf;
}

function createWebPage() {
	var page = webPage.create();
	if (UA) {
		page.settings.userAgent = UA;
		/* https://github.com/ariya/phantomjs/issues/12169 */
		page.customHeaders = {'User-Agent': UA};
	}
	return page;
}

function log(text) {
	console.log(new Date(Date.now()).toISOString() + ': ' + text);
}

function getPageCookie(page, cookie) {
	if (page) {
		for (var i = 0; i < page.cookies.length; i++) {
			if (page.cookies[i].name == cookie) {
				return page.cookies[i].value;
			}
		}
	}
	return null;
}

function getHeaderValue(hdrs, name) {
	for (var i = 0; i < hdrs.length; i++) {
		if (hdrs[i].name == name) {
			return hdrs[i].value;
		}
	}
	return null;
}

function isCFRunning(page) {
	return page.evaluate(function() {
		var cf = 0, t = document.getElementsByTagName('title');
		if (t.length)	cf |= t[0].innerHTML == 'Just a moment...' ? 1 : 0;
		cf |= document.getElementById('challenge-form') ? 2 : 0;
		cf |= document.getElementById('jschl-answer') ? 4 : 0;
		return cf;
	});
}


function preventFurtherRequests(page) {
	page.setContent('', dvachURL);
}

function disablePageCallbacks(page) {
	page.onResourceError = page.onResourceReceived = null;
}

function getUsercodeCookie(page, usercode, callback) {
	var retryTimeoutId;
	var cfTimeoutId = 0;
	
	(function loop() {
		retryTimeoutId = 0;
		page.onResourceReceived = function (response) {
			if (response.stage == 'end') {
				if (Math.floor(response.status / 100) == 3) {


					


					for (var i = 0; i < response.headers.length; i++) {
						if (response.headers[i].name == 'Set-Cookie' && response.headers[i].value.indexOf('usercode_nocaptcha') != -1) {
							break;
						}
					}
					if (i < response.headers.length) {


						disablePageCallbacks(page);
						preventFurtherRequests(page);

						/* redirectUrl is null when location has no scheme (https://github.com/ariya/phantomjs/issues/10998) */
						log('getUsercodeCookie.onResourceReceived: Status: ' + response.status + '. Usercode cookie received. Location: ' + getHeaderValue(response.headers, 'Location'));
						if (callback) callback(page);
					} else if (cfTimeoutId) {
						log('getUsercodeCookie.onResourceReceived: Redirection is here. Clearing fallback CF timeout...');
						window.clearTimeout(cfTimeoutId);
						cfTimeoutId = 0;
					} else {

						log('getUsercodeCookie.onResourceReceived: Unexpected behaviour: status 3xx without usercode cookie. Response: ' + JSON.stringify(response));
					}
				} else if (response.status == 200) {










						
					if (page.evaluate(function(){return document.querySelector('img[src="/makaba/templates/img/makaka.gif"]');})) {
						var text = page.evaluate(function(){return document.getElementsByClassName('box-header')[0].textContent;});
						log('getUsercodeCookie.onResourceReceived: Error during usercode request. Error text: ' + text);
						
						disablePageCallbacks(page);
						preventFurtherRequests(page);
						if (!retryTimeoutId) {
							retryTimeoutId = window.setTimeout(loop, 60000);
						} else {
							log('getUsercodeCookie.onResourceReceived: WARNING: Attempt to set second timeout prevented.');
						}
					} else {
						log('getUsercodeCookie.onResourceReceived: Status: ' + response.status + '. Doing nothing. URL: ' + response.url);
					}
				} else {
					log('getUsercodeCookie.onResourceReceived: Unexpected status: ' + response.status + ' Response: ' + JSON.stringify(response));
				}
			}
		};
		page.onResourceError = function(error) {
			var cfRunning;
			if (cfRunning = isCFRunning(page)) {
				log('getUsercodeCookie.onResourceError: CloudFlare DDoS protection detected (' + cfRunning + '). Waiting...');
				if (!cfTimeoutId) {
					cfTimeoutId = window.setTimeout(function() {
						cfRunning = cfTimeoutId = 0;
						disablePageCallbacks(page);
						preventFurtherRequests(page);
						log('getUsercodeCookie.cfTimeout: We have waited for CF for 30 seconds, but redirection didn\'t came. Retrying...');
						loop();
					}, 30000);
				} else {
					log('getUsercodeCookie.onResourceError: WARNING: Attempt to set second CF timeout prevented.');
				}
			} else {
				log('getUsercodeCookie.onResourceError: Error: ' + JSON.stringify(error));
				disablePageCallbacks(page);
				preventFurtherRequests(page);
				if (!retryTimeoutId) {
					retryTimeoutId = window.setTimeout(loop, 60000);
				} else {
					log('getUsercodeCookie.onResourceError: WARNING: Attempt to set second timeout prevented.');
				}
			}
		};
		page.open(dvachURL + '/makaba/makaba.fcgi?task=auth&usercode=' + usercode, null);
	})();
}

function sendPost(page, post, callback, usercode) {
	if (post.images) {
		if (!Array.isArray(post.images)) {
			console.log('sendPost: ERROR: post.images should be an array.');
			phantom.exit(1);
		}
	}
	

	var retryTimeoutId;
	var cfTimeoutId = 0;
	page.settings.resourceTimeout = 60 * 1000;

	(function loop() {
		disablePageCallbacks(page);
		preventFurtherRequests(page);

		retryTimeoutId = 0;

               if (usercode && !getPageCookie(page, 'usercode_nocaptcha')) {
                       getUsercodeCookie(page, usercode, loop);
                       return;
               }

		page.onResourceReceived = function (response) {
			if (response.stage == 'end') {
				if (response.status == 200) {

					try {var json = JSON.parse(page.plainText); } catch (err) { var json = null; }
					if (json) {
						/* New post: {"Error": null, "Status": "OK", "Num": 80947840} */
						/* New thread: {"Error": null,"Status": "Redirect", "Target": 80947905} */
						if (!json.Error && (json.Status == 'OK' || json.Status == 'Redirect')) {
							var id = json.Num || json.Target;
							disablePageCallbacks(page);
							preventFurtherRequests(page);
							log('sendPost.onResourceReceived: New post: ' + id);
							if (callback) callback(post, id);
						} else {
							log('sendPost.onResourceReceived: 2ch error: ' + json.Reason + ' (' + json.Error + ')');
							/*
							{"Error":-2,"Reason":"Доска не существует."}
							{"Error":-4,"Reason":"Постинг временно закрыт на технические работы."}
							{"Error":-5,"Reason":"Капча невалидна."}
							{"Error":-8,"Reason":"Вы постите слишком быстро."}
							{"Error":-10,"Reason":"Файл уже существует на сервере."}
							{"Error":-11,"Reason":"Тип файла не поддерживается."}
							{"Error":-20,"Reason":"Вы ничего не запостили."}							
							*/
							if (json.Error == -5) {
								disablePageCallbacks(page);
								preventFurtherRequests(page);
								if (usercode) {
									getUsercodeCookie(page, usercode, loop);
								} else {
									log('sendPost.onResourceReceived: ERROR: No usercode available and captcha is present.');
								}
							} else if (json.Error == -8) {
								disablePageCallbacks(page);

								if (!retryTimeoutId) {
									retryTimeoutId = window.setTimeout(loop, 20000);
								} else {
									log('sendPost.onResourceReceived: WARNING: Attempt to set second timeout prevented.');
								}
							} else if (json.Error == -4) {
								disablePageCallbacks(page);
								if (!retryTimeoutId) {
									retryTimeoutId = window.setTimeout(loop, 60000);
								} else {
									log('sendPost.onResourceReceived: WARNING: Attempt to set second timeout prevented.');
								}
							} else if (json.Error == -10) {
								if (post.images) {
									log('sendPost.onResourceReceived: Adding more random data to post images...');

									disablePageCallbacks(page);
									preventFurtherRequests(page);
									loop();
								}
							} else {
								log('sendPost.onResourceReceived: Unexpected 2ch error. Response JSON: ' + page.plainText);
							}
						}
					} else {
						if (response.url.indexOf('ssl.google-analytics.com') == -1) {
							log('sendPost.onResourceReceived: Status: ' + response.status + '. Doing nothing. URL: ' + response.url);



						}
					}
				} else if (Math.floor(response.status/100) == 3) {
					if (cfTimeoutId) {


						log('sendPost.onResourceReceived: Redirection is here. Clearing fallback CF timeout...');
						window.clearTimeout(cfTimeoutId);
						cfTimeoutId = 0;
						disablePageCallbacks(page);
						preventFurtherRequests(page);
						loop();
					} else {
						log('sendPost.onResourceReceived: Unexpected status: ' + response.status + ' Response: ' + JSON.stringify(response));
					}
				} else {
					log('sendPost.onResourceReceived: Unexpected status: ' + response.status + ' Response: ' + JSON.stringify(response));
				}
			}
		};

		page.onResourceError = function(error) {
			var cfRunning = 0;
			if (cfRunning = isCFRunning(page)) {
				log('sendPost.onResourceError: CloudFlare DDoS protection detected (' + cfRunning + '). Waiting...');
				if (!cfTimeoutId) {
					cfTimeoutId = window.setTimeout(function() {
						log('sendPost.cfTimeout: We have waited for CF for 30 seconds, but redirection didn\'t came. Retrying...');
						cfTimeoutId = 0;
						disablePageCallbacks(page);
						preventFurtherRequests(page);
						loop();
					}, 30000);
				} else {
					log('sendPost.onResourceError: WARNING: Attempt to set second CF timeout prevented.');
				}
			} else {
				log('sendPost.onResourceError: Error: ' + JSON.stringify(error));

				disablePageCallbacks(page);
				preventFurtherRequests(page);
				
				if (!retryTimeoutId) {
					retryTimeoutId = window.setTimeout(loop, 60000);
				} else {
					log('sendPost.onResourceError: WARNING: Attempt to set second timeout prevented.');
				}



			}
		};

		var formData = new MultipartFormData();
 		formData.addField('task', 'post');
 		formData.addField('board', stringToUTF8_BMP(post.board));
 		formData.addField('thread', post.thread);
 		formData.addField('email', stringToUTF8_BMP(post.email || ''));
 		formData.addField('name', stringToUTF8_BMP(post.name || ''));
 		formData.addField('subject', stringToUTF8_BMP(post.subject || ''));
 		formData.addField('comment', stringToUTF8_BMP(post.comment || ''));
 		if (post.op) {
 			formData.addField('op_mark', '1');
 		}

 		if (post.images) {
 			for (var i = 0; i < post.images.length; i++) {

 				var image = fs.read(post.images[i], {mode: 'rb'});

 				/* image += Date.now().toString(36) + Math.round(Math.random() * 1000000).toString(36); */
 				formData.addFile('image' + (i+1), 'image.jpg', image);
 			}
 		}

		var obj = formData.getData();
 		var settings = {
 			operation: "POST",
 			headers: {"Content-Type": "multipart/form-data; boundary=" + obj.boundary},
 			data: obj.data
 		};




		page.open(dvachURL + '/makaba/posting.fcgi', settings, function(){});
	})();
}

function postIdFromUrl(url) {


	return url.replace(/.*\/(([0-9]+\.html#([0-9]+))|(([0-9]+)\.html#?))/, '$3$5');
}

function waitForPost(board, threadId, postNum, timeout, callback) {
	var page = createWebPage();
	(function loop() {
		page.open(dvachURL + '/makaba/mobile.fcgi?task=get_thread&board=' + board + '&thread=' + threadId + '&post=' + postNum, function(status) {
			page.onLoadFinished = null;
			if (status == 'success') {
				try {

					var json = JSON.parse(page.plainText);
				} catch (error) {
					var json = null;
				}

				if (json) {


					if (!json.Error) {
						if (json.length > 0) {
							page.close();
							

							if (postNum > 1 && (json[0].parent == 0 || json[0].num == threadId)) {

								log('waitForPost.onLoadFinished: Fatal Error: get_thread has ignored starting post parameter and returned all posts in thread!');
							} else {
								callback(json);
							}
						} else {
							window.setTimeout(loop, timeout);
						}
					} else {
						log('waitForPost.onLoadFinished: 2ch error: ' + page.plainText);
						window.setTimeout(loop, timeout);
					}
				} else {


					window.setTimeout(loop, 60000);
				}
			} else {
				window.setTimeout(loop, 60000);
			}
		});
	})();
}


function repeatPost(board, thread, postId, comment) {
	var page = createWebPage();
	var myPosts = [postId];
	var replyTo = [];
	var postNum = 2; // First post is OP, wait for second

	(function loop() {

		waitForPost(board, thread, postNum, 60000, function(posts) {
			postNum += posts.length;
			for (var i = 0; i < posts.length; i++) {
				for (var j = 0; j < myPosts.length; j++) {
					if (posts[i].comment.indexOf('>>' + myPosts[j]) != -1) {
						log('repeatPost.onLoadFinished: Reply to ' + myPosts[j] + ' detected: ' + posts[i].num);
						replyTo.push(posts[i].num);
						break;
					}
				}
			}
			
			(function sendReplies() {
				if (replyTo.length) {
					var rep = replyTo.shift();
					var cmt = typeof(comment) == 'function' ? comment() : comment;
					sendPost(page, {board: board, thread: thread, comment: '>>' + rep + '\n' + cmt},  function(post, postId) {






						myPosts.unshift(postId);
						window.setTimeout(sendReplies, 16000);
					});
				} else {
					loop();
				}
			})();
		});
	})();
}

function repeatPostURL(url, comment) {
	var args = url.match(/https:\/\/2ch\.hk\/([a-z]+)\/res\/([0-9]+)\.html#([0-9]+)/);
	if (args && args.length == 4) repeatPost(args[1], args[2], parseInt(args[3], 10), comment);
}

/* Durstenfeld (Knuth-Fisher-Yates) shuffle
/* http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array */

function shuffleArray(array) {
	for (var i = array.length - 1; i > 0; i--) {
		var j = Math.floor(Math.random() * (i + 1));
		var temp = array[i];
		array[i] = array[j];
		array[j] = temp;
	}
	return array;
}

function createPerdolyaGenerator() {
	var phrases = [];
	var current = phrases.length;
	
	return (function() {
		if (current == phrases.length) {

			var text = 'Пердоля, зачем ты сам с собой разговариваешь?\n\
Пердоля, ты опять сам с собой разговариваешь?\n\
Пердоля, снова антифорсишь?\n\
Пердоля, зачем опять перефорсишь?\n\
Пердоля, ты опять других своим именем называешь?\n\
Пердоля, тебе так обидно что ты [b]ПЕРДОЛЯ[/b]?\n\
Пердоля, ты своим перефорсом уже всю доску засрал.\n\
Ты жалок со своим антифорсом, [b]ПЕРДОЛЯ[/b].\n\
Лол, Пердоля опять бабахает.\n\
Пердоля, прими таблетки и перестань разговаривать сам с собой.\n\
Пердоля, чего опять зареверсил? Мало тебя обоссали?\n\
Пердоля, ты промолчать конечно не мог.\n\
Пердоля, кто тебя из палаты выпустил?\n\
Пердоля, каникулы длинные, так что анус твой никогда не остынет.\n\
Пердоля бомбанул и пошел в перефорс, хлопая крыльями.\n\
Пердоля, всё-таки мало ты реверсишь.\n\
Пердоля невер чейнджес. Ты даже перестал стараться.\n\
Пердоля, чёт давно ты не антифорсил. Срачло лечил штоле?\n\
Пердоля, перестань разговаривать с зеркалом.\n\
Пердоля, не бушуй. Лучше попердолься майнером и кейлоггером.\n\
Пердоля, ты всё у зеркала стоишь?\n\
Лол, Пердоля загорелся и зареверсил.';
			/* var text = fs.read('perdolya.txt'); */

			phrases = text.replace(/\n{2,}/g, '\n').replace(/^\n|\n$/g, '').split('\n');
			shuffleArray(phrases);
			current = 0;
		}
		var phrase = phrases[current++];

		if (Math.floor(Math.random() * 2 ) == 1) {

			phrase = phrase.replace(/Пердоля,/, 'Пердоль,');
		}

		if (Math.floor(Math.random() * 3) == 2) {
			phrase = phrase.replace(/[Пп]ердоля/, '[b]ПЕРДОЛЯ[/b]');
		}
		return phrase;
	});
}


(function main() {
	if (sys.args.length > 1) {



		if (sys.args[1] == 'repeat' && sys.args.length > 3) {
			repeatPostURL(sys.args[2], sys.args[3]);
		} else if (sys.args[1] == 'antiperdolya' && sys.args.length > 2) {
			repeatPostURL(sys.args[2], createPerdolyaGenerator());
		}
	} else {
		console.log('ERROR: Nothing to do. Specify an argument.');
		phantom.exit(1);
	}
})();
