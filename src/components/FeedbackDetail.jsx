import React from 'react';

function FeedbackDetail({ feedback }) {
  if (!feedback) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Select feedback to view details</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Feedback Details
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Submitted on {new Date(feedback.timestamp).toLocaleString()}
        </p>
      </div>
      
      <div className="px-4 py-5 sm:p-6">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500">ID</dt>
            <dd className="mt-1 text-sm text-gray-900">{feedback.id}</dd>
          </div>
          
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500">Session ID</dt>
            <dd className="mt-1 text-sm text-gray-900">{feedback.sessionId}</dd>
          </div>
          
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500">Response ID</dt>
            <dd className="mt-1 text-sm text-gray-900">{feedback.responseId}</dd>
          </div>
          
          <div className="sm:col-span-1">
            <dt className="text-sm font-medium text-gray-500">Rating</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <div className="flex items-center">
                <span className="mr-2">{feedback.rating}/5</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                      key={star}
                      className={`h-5 w-5 ${
                        star <= feedback.rating ? 'text-yellow-400' : 'text-gray-300'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
            </dd>
          </div>
          
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Explanation Clarity</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                feedback.explanationClear === 'yes' 
                  ? 'bg-green-100 text-green-800' 
                  : feedback.explanationClear === 'partially'
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {feedback.explanationClear === 'yes' 
                  ? 'Clear' 
                  : feedback.explanationClear === 'partially'
                  ? 'Partially Clear' 
                  : 'Not Clear'}
              </span>
            </dd>
          </div>
          
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Explanation Detail</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                feedback.explanationDetail === 'more_detailed' 
                  ? 'bg-blue-100 text-blue-800' 
                  : feedback.explanationDetail === 'exactly_right'
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {feedback.explanationDetail === 'more_detailed' 
                  ? 'Requested More Detail' 
                  : feedback.explanationDetail === 'exactly_right'
                  ? 'Detail Level Appropriate' 
                  : 'Requested Simpler Explanation'}
              </span>
            </dd>
          </div>
          
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Analogy Helpfulness</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                feedback.analogyHelpful === 'yes' 
                  ? 'bg-green-100 text-green-800' 
                  : feedback.analogyHelpful === 'partially'
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {feedback.analogyHelpful === 'yes' 
                  ? 'Helpful' 
                  : feedback.analogyHelpful === 'partially'
                  ? 'Partially Helpful' 
                  : 'Not Helpful'}
              </span>
            </dd>
          </div>
          
          {feedback.analogyPreference && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Preferred Analogy Type</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <span className="px-2 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800">
                  {feedback.analogyPreference.charAt(0).toUpperCase() + feedback.analogyPreference.slice(1)}
                </span>
              </dd>
            </div>
          )}
          
          {feedback.comments && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">User Comments</dt>
              <dd className="mt-1 text-sm text-gray-900 bg-gray-50 p-3 rounded border border-gray-200">
                {feedback.comments}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

export default FeedbackDetail;