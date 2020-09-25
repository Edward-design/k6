import { sleep, group, check } from "k6";
import http from "k6/http";
//import { Rate } from 'k6/metrics';

//const myFailRate = new Rate('failed requests');

import jsonpath from "https://jslib.k6.io/jsonpath/1.0.2/index.js";

const users = JSON.parse(open('/ci/loadtests/users.json'));

//This script creates one assignment, 3 students submit, bulk reopens, then deletes assignment.

export const options = {
  //stages: [
    //{ duration: "1m", target: 10 },
    //{ duration: "1m", target: 10 },
    //{ duration: "1m", target: 0 },
  //],
  thresholds: {
   // 'failed requests': ['rate<0.1'], // threshold on a custom metric
    'http_req_duration': ['p(95)<2000']  // threshold on a standard metric
  }
 }; 

export default function main() {
  let match, response;
  
  const vars = {};
  
  //remember all below lines must be within the scope of the function you are calling.
  
 // const rnd = Math.floor(Math.random() * 5); //returns a random integer from 0 to 4
  //console.log(rnd);
  
 // let user = users[rnd];
 // console.log(`${user.username}`);
  
 // vars["Teacher"] = user.username;
 // console.log(`${vars["Teacher"]}`);
 // console.log(`${vars["Teacher_Username"]}`);
 
 //vars["Teacher"] = UserName
 //console.log(`${vars["Teacher"]}`);
  
  
  
  group("TeacherIDM - Gets IDM Token for a Teacher", function () {
	  
  const rnd = Math.floor(Math.random() * 5); //returns a random integer from 0 to 4
  console.log(rnd);
  
  let user = users[rnd];
  //console.log(`${user.username}`);
  
  vars["Teacher"] = user.username;
  //console.log(`${vars["Teacher"]}`);
  
   response = http.post(
      "https://idm-pqa.mheducation.com/v1/token",
      {
        client_id: "EngradeStageClient",
        client_secret: "EngradeStageClient",
        username: `${vars["Teacher"]}`,
        password: "Passpass1",
        grant_type: "password",
        scope: "auth",
      },
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "cache-control": "no-cache",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    check(response, {
      "status equals 200": response => response.status.toString() === "200",
    });
  });
   vars["access_token"] = jsonpath.query(response.json(), "$.access_token")[0];
   
   group("Get Org XID", function () {
    response = http.get(
      "https://shell-api-pqa.lms.nonprod.mheducation.com/v1/user",
      {
        headers: {
          Accept: "*/*",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
          Authorization: `Bearer ${vars["access_token"]}`,
        },
      }
    );
    check(response, {
      "status equals 200": response => response.status.toString() === "200",
    });
   });
    
	vars["Org_XID"] = jsonpath.query(response.json(),"$.affiliations.entities.instructor.organizations[0]")[0];
	vars["Role"] = jsonpath.query(response.json(),"$.affiliations.entities.instructor.role")[0];
	console.log(`${vars["Org_XID"]}`);
	console.log(`${vars["Role"]}`);
   
   group("Get SectionXID - Uses RegEx", function () {
	response = http.get(
    `https://portal-pqa.lms.nonprod.mheducation.com/v1/user/resources?org_xid=${vars["Org_XID"]}&role=${vars["Role"]}`,
    {
      headers: {
        authorization: `Bearer ${vars["access_token"]}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate",
        Accept: "*/*",
      },
    }
  );
  check(response, {
    "status equals 200": response => response.status.toString() === "200",
  });
  
  match = new RegExp(
    "KEEP.{10,100}.,.launchURL.:.{25,200}section...(.{36}).,.thumbnail.:..url.:.{50,200}.png..,.id.:.(urn:com.mheducation.openlearning:enterprise.roster:pqa.us-east-1:section:.{36}).,.metadata.:..grades.:..[0-9]{1,2}..,.subjects.:...{3,50}..,.isAddon.:false,.simplified_students_enabled.:.{1,10},.startDate.:..{20}.,.endDate.:..{20}.,.expirationStatus.:..{6,12}..,.course.:..xid.:..{36}.,.id.:..{36}.,.product_id.:.(.{36}).,.resource_id.:..{36}.,.title.:.(.{5,60}).,.platform.:.openlearning.,.thumbnail.:..url.:..{50,200}.png..,.banner.:..,.product_xid.:.(urn:com.mheducation.openlearning:enterprise.product:pqa.global:product:.{36}).,"
  ).exec(response.body);
  
  vars["section_xid"] = match[2];
  
  console.log(`${vars["section_xid"]}`);
  
});
   
   group("Create_SubAssign - Creates Submission Assignment", function () {
	response = http.put(
      "https://assignments-api-pqa.lmspqa.nonprod.mheducation.com/v1/assignments",
      `{
      "assignments": [{
        "sectionXid": "${vars["section_xid"]}",
        "title": "K6_PQA_SUCCESS",
        "points": "10",
        "start": 1597723200,
        "due": 1629431940,
        "gradebookCategory": 1,
        "creator": 1234567890,
        "type":4,
        "assignToAllStudents":true
      }]
    
    }`,
      {
        headers: {
          Authorization: `Bearer ${vars["access_token"]}`,
          "Content-Type": "application/json",
          Accept: "*/*",
          "Accept-Encoding": "gzip,deflate,br",
        },
      }
    );
    check(response, {
      "status equals 200": response => response.status.toString() === "200",
    });
	
	//vars["section_xid"] = jsonpath.query(response.json(),"$[0].section_xid")[0];
    vars["assignment_xid"] = jsonpath.query(response.json(),"$[0].assignment_xid")[0];
  });
  
  group("Get LearnerXID - Captures LearnerXID", function () {
  response = http.post(
    "https://assignments-api-pqa.lmspqa.nonprod.mheducation.com/v1/student-assignments",
    `{
    	"sectionXid": "${vars["section_xid"]}",
    	"assignmentXids": ["${vars["assignment_xid"]}"],
    	"includeNames": true,
    	"nameOrder": "First Last",
    	"includeScores": true,
    	"includeComments": true,
    	"includeStudentAssignmentStatus": true,
    	"includeAttemptStatus": true,
    	"loadRelationships": ["attempts"],
    	"includeLastSubmittedDetails": true
    }`,
    {
      headers: {
        authorization: `Bearer ${vars["access_token"]}`,
        "Content-Type": "application/json",
      },
    }
);
  check(response, {
    "status equals 200": response => response.status.toString() === "200",
  });
  
  vars["learner_xid01"] = jsonpath.query(response.json(), "$[0].learner_xid")[0];
  vars["learner_xid02"] = jsonpath.query(response.json(), "$[1].learner_xid")[0];
  vars["learner_xid03"] = jsonpath.query(response.json(), "$[2].learner_xid")[0];
  
});
  
   group("StudentIDM - Gets IDM Token for a Student", function () {
    response = http.post(
      "https://idm-pqa.mheducation.com/v1/token",
      {
        client_id: "EngradeStageClient",
        client_secret: "EngradeStageClient",
        username: "MSTSTU50033017822781",
        password: "Passpass1",
        grant_type: "password",
        scope: "auth",
      },
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "cache-control": "no-cache",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    check(response, {
      "status equals 200": response => response.status.toString() === "200",
    });
  });
   vars["student_access_token"] = jsonpath.query(response.json(), "$.access_token")[0];
   
  group("StudentSubmit - Student Submits Assignment", function () {
   response = http.put(
    "https://assignments-api-pqa.lmspqa.nonprod.mheducation.com/v1/student-assignment-attempts/submit",
    `{
    	"sectionXid": "${vars["section_xid"]}",
    	"assignmentXid": "${vars["assignment_xid"]}",
    	"learnerXid": "${vars["learner_xid01"]}",
    	"attemptId": 1
    }`,
    {
      headers: {
        authorization: `Bearer ${vars["access_token"]}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=9.0",
      },
    }
  );
  check(response, {
    "status equals 200": response => response.status.toString() === "200",
  });
  
  vars["learner_attempt_xid01"] = jsonpath.query(response.json(),"$.student_assignment_attempt_xid")[0];
  
  response = http.put(
    "https://assignments-api-pqa.lmspqa.nonprod.mheducation.com/v1/student-assignment-attempts/submit",
    `{
    	"sectionXid": "${vars["section_xid"]}",
    	"assignmentXid": "${vars["assignment_xid"]}",
    	"learnerXid": "${vars["learner_xid02"]}",
    	"attemptId": 1
    }`,
    {
      headers: {
        authorization: `Bearer ${vars["access_token"]}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=9.0",
      },
    }
  );
  check(response, {
    "status equals 200": response => response.status.toString() === "200",
  });
  
  vars["learner_attempt_xid02"] = jsonpath.query(response.json(),"$.student_assignment_attempt_xid")[0];
  
  response = http.put(
    "https://assignments-api-pqa.lmspqa.nonprod.mheducation.com/v1/student-assignment-attempts/submit",
    `{
    	"sectionXid": "${vars["section_xid"]}",
    	"assignmentXid": "${vars["assignment_xid"]}",
    	"learnerXid": "${vars["learner_xid03"]}",
    	"attemptId": 1
    }`,
    {
      headers: {
        authorization: `Bearer ${vars["access_token"]}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=9.0",
      },
    }
  );
  check(response, {
    "status equals 200": response => response.status.toString() === "200",
  });
});

vars["learner_attempt_xid03"] = jsonpath.query(response.json(),"$.student_assignment_attempt_xid")[0];

sleep(10);

   group("BulkReopen - Reopens all three submitted assignments", function () {
    response = http.post(
    `https://assignments-api-pqa.lmspqa.nonprod.mheducation.com/v1/assignment/${vars["assignment_xid"]}/reopen`,
    `{
    	"sectionXid": "${vars["section_xid"]}",
    	"assignmentXid": "${vars["assignment_xid"]}",
    	"learnerAttempts": [{
    		"learnerXid": "${vars["learner_xid01"]}",
    		"learnerAttemptXid": "${vars["learner_attempt_xid01"]}",
    		"attemptId": 1
    	}, {
    		"learnerXid": "${vars["learner_xid02"]}",
    		"learnerAttemptXid": "${vars["learner_attempt_xid02"]}",
    		"attemptId": 1
    	}, {
    		"learnerXid": "${vars["learner_xid03"]}",
    		"learnerAttemptXid": "${vars["learner_attempt_xid03"]}",
    		"attemptId": 1
    	}]
    }`,
    {
      headers: {
        authorization: `Bearer ${vars["access_token"]}`,
        "Content-Type": "application/json",
      },
    }
  );
  check(response, {
    "status equals 200": response => response.status.toString() === "200",
  });
});

sleep(8);

   group("Delete Assignment", function () {
	 response = http.del(
    "https://assignments-api-pqa.lmspqa.nonprod.mheducation.com/v1/assignments",
    `{
    	"sectionXid": "${vars["section_xid"]}",
    	"assignmentXids": ["${vars["assignment_xid"]}"]
    }`,
    {
      headers: {
        authorization: `Bearer ${vars["access_token"]}`,
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
      },
    }
  );
  check(response, {
    "status equals 200": response => response.status.toString() === "200",
  });
});
	   
	   
}
